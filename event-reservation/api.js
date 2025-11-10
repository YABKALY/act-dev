// api.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit'); // NEW: brute-force protection
const db = require('./pgdb');

const router = express.Router();

// --- ENVIRONMENT SAFETY CHECKS (recommended) ---
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  // Strongly encourage a long random secret
  console.warn('⚠️  JWT_SECRET is missing or too short. Set a strong JWT_SECRET in your environment.');
}

// --- HELPERS ---
const parseBearer = (header) => {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
};

// --- AUTH MIDDLEWARES (unchanged behavior, slightly hardened) ---

// Generic token authentication (Organizer or Admin)
const authenticateToken = (req, res, next) => {
  const token = parseBearer(req.headers['authorization']);
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: Bearer token required in Authorization header.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Forbidden: Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
};

// Admin-only (requires isAdmin flag)
const authenticateMainAdmin = (req, res, next) => {
  const token = parseBearer(req.headers['authorization']);
  if (!token) return res.status(401).json({ message: 'Unauthorized: Bearer token required.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err || !user?.isAdmin) {
      return res.status(403).json({ message: 'Forbidden: Admin privileges required.' });
    }
    req.user = user;
    next();
  });
};

// --- GLOBAL ENFORCEMENT: ALL ROUTES REQUIRE AUTH EXCEPT ALLOW-LISTED PUBLIC ONES ---

// Add any public endpoints here (exact paths)
const PUBLIC_ROUTES = new Set([
  '/admin/login',
  '/organizer/login',
]);

// For route patterns that include router-level prefixes, we also check originalUrl.
// This ensures "/v1/admin/login" still passes if the router is mounted under /v1.
router.use((req, res, next) => {
  const pathOnly = req.path;           // path relative to this router
  const fullPath = req.originalUrl;    // full path from the app mount point

  // Allow exact matches for public endpoints either by path or suffix of originalUrl
  const isPublic =
    PUBLIC_ROUTES.has(pathOnly) ||
    [...PUBLIC_ROUTES].some(p => fullPath.endsWith(p));

  if (isPublic) return next();
  return authenticateToken(req, res, next);
});

// --- RATE LIMITERS (login endpoints only) ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,                    // limit each IP to 20 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' },
});

// --- EXISTING ADMIN ENDPOINTS (Functionality Unchanged) ----

/**
 * @route   POST /admin/login
 * @desc    Logs in a main admin. Issues a token with isAdmin flag.
 * @access  Public
 */
router.post('/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const admin = await db.getAdminByUsername(username);
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const accessToken = jwt.sign(
      { username: admin.username, id: admin.id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ accessToken });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route   POST /admin/events
 * @desc    Creates a new event (and deactivates old ones).
 * @access  Protected (Organizer or Admin) - already covered by global auth
 */
router.post('/admin/events', async (req, res) => {
  try {
    const { eventName, eventDate } = req.body || {};
    if (!eventName || !eventDate) {
      return res.status(400).json({ message: 'Event name (eventName) and date (eventDate) are required.' });
    }

    const event = await db.createEvent(eventName, eventDate);
    res.status(201).json({ message: 'Event created successfully.', event });
  } catch (error) {
    console.error('Event creation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route   GET /admin/reservations
 * @desc    Gets all reservations for the currently active event.
 * @access  Protected (Organizer or Admin) - already covered by global auth
 */
router.get('/admin/reservations', async (req, res) => {
  try {
    const reservations = await db.getReservations();
    res.json(reservations);
  } catch (error) {
    console.error('Fetching reservations error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- NEW ENDPOINTS for Organizers and Attendance ---

/**
 * @route   POST /admin/create-organizer
 * @desc    (Admin Only) Creates a new event organizer account.
 * @access  Protected (Main Admin Only)
 */
router.post('/admin/create-organizer', authenticateMainAdmin, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  try {
    const organizer = await db.createOrganizer(username, password, req.user.id);
    res.status(201).json({ message: 'Organizer created successfully', organizer });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Username already exists.' });
    }
    res.status(500).json({ message: 'Error creating organizer', error: error.toString() });
  }
});

/**
 * @route   GET /admin/events/:id/attendees
 * @desc    Gets a list of all students who attended a specific past event.
 * @access  Protected (Main Admin Only)
 */
router.get('/admin/events/:id/attendees', authenticateMainAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const attendees = await db.getAttendeesByEventId(id);
    if (!attendees) {
      return res.status(404).json({ message: 'Event not found or no attendees.' });
    }
    res.json(attendees);
  } catch (error) {
    console.error('Error fetching event attendees:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route   GET /admin/dashboard-stats
 * @desc    Provides a set of key metrics for the admin dashboard.
 * @access  Protected (Main Admin Only)
 */
router.get('/admin/dashboard-stats', authenticateMainAdmin, async (req, res) => {
  try {
    const [
      todaysRegistrations,
      upcomingEventReservations,
      allRegisteredUsers
    ] = await Promise.all([
      db.countTodaysRegistrations(),
      db.countActiveEventReservations(),
      db.getAllStudents()
    ]);

    const dashboardData = {
      todaysRegistrations,
      upcomingEventReservations,
      totalRegisteredUsers: allRegisteredUsers.length,
      allUsers: allRegisteredUsers
    };

    res.json(dashboardData);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route   POST /organizer/login
 * @desc    Logs in an event organizer and returns a standard token.
 * @access  Public
 */
router.post('/organizer/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  try {
    const organizer = await db.getOrganizerByUsername(username);
    if (!organizer || !(await bcrypt.compare(password, organizer.password_hash))) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const accessToken = jwt.sign(
      { username: organizer.username, id: organizer.id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ accessToken });
  } catch (error) {
    console.error('Organizer login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route   POST /organizer/mark-attendance
 * @desc    Marks a student as attended for the current active event.
 * @access  Protected (Organizer or Admin) - already covered by global auth
 */
router.post('/organizer/mark-attendance', async (req, res) => {
  const { studentId } = req.body || {};
  if (!studentId) {
    return res.status(400).json({ message: 'studentId is required.' });
  }
  try {
    const activeEvent = await db.getActiveEvent();
    if (!activeEvent) {
      return res.status(404).json({ success: false, message: 'No active event found to mark attendance for.' });
    }

    const success = await db.markAttendance(studentId, activeEvent.id);
    if (success) {
      const student = await db.getStudentDetailsById(studentId);
      res.status(200).json({ success: true, message: `Attendance marked for ${student.full_name}.` });
    } else {
      res.status(409).json({ success: false, message: 'Attendance already marked, or invalid ID for this event.' });
    }
  } catch (error) {
    console.error('Attendance error:', error);
    res.status(500).json({ message: 'Server error marking attendance.' });
  }
});


/**
 * @route   GET /organizer/random-winners
 * @desc    Selects up to 5 random winners from the active event's attendees.
 * @access  Protected (Organizer or Admin)
 */
router.get('/organizer/random-winners', async (req, res) => {
    try {
        const attendees = await db.getActiveEventAttendees();

        // Case 1: No one has been marked as attended yet.
        if (!attendees || attendees.length === 0) {
            return res.status(404).json({ message: 'No attended people for now.' });
        }

        // Case 2: There are attendees. Shuffle the array to randomize.
        // (Fisher-Yates shuffle algorithm)
        for (let i = attendees.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [attendees[i], attendees[j]] = [attendees[j], attendees[i]];
        }

        // Take the first 5 people. If there are fewer than 5, it will just take all of them.
        const winners = attendees.slice(0, 5);

        // Respond with the list of winners.
        res.json({ winners });

    } catch (error) {
        console.error('Error selecting random winners:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
module.exports = router;
