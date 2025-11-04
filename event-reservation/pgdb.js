const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false } 
});

/**
 * Initializes the database: creates all tables if they don't exist
 * and creates a default admin user.
 */
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY, 
                telegram_id BIGINT UNIQUE NOT NULL,
                username TEXT,
                full_name TEXT NOT NULL,
                phone_number TEXT NOT NULL,
                year_of_study TEXT NOT NULL,
                department TEXT NOT NULL,
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            );
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS organizers (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_by INTEGER REFERENCES admins(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                event_name TEXT NOT NULL,
                event_date DATE NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reservations (
                id SERIAL PRIMARY KEY,
                student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
                attendance_status TEXT NOT NULL,
                feedback TEXT,
                attended BOOLEAN DEFAULT FALSE,
                attended_at TIMESTAMP,
                UNIQUE (student_id, event_id)
            );
        `);

        const adminRes = await pool.query('SELECT COUNT(*) FROM admins WHERE username = $1', [process.env.DEFAULT_ADMIN_USER]);
        if (parseInt(adminRes.rows[0].count) === 0) {
            console.log('No default admin found. Creating one...');
            const salt = await bcrypt.genSalt(10);
            const passHash = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASS, salt);
            await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [process.env.DEFAULT_ADMIN_USER, passHash]);
            console.log('Default admin created successfully.');
        }

        console.log("All database tables checked/created successfully.");
    } catch (error) {
        console.error("Error initializing database:", error);
        process.exit(1);
    }
};

// --- USER & STUDENT FUNCTIONS ---

const saveUser = async (userData) => {
    const query = `
        INSERT INTO students (telegram_id, username, full_name, phone_number, year_of_study, department)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (telegram_id) 
        DO UPDATE SET 
            full_name = EXCLUDED.full_name,
            phone_number = EXCLUDED.phone_number,
            year_of_study = EXCLUDED.year_of_study,
            department = EXCLUDED.department
        RETURNING id;
    `;
    const values = [
        userData.telegram_id,
        userData.username || null,
        userData.full_name,
        userData.phone_number,
        userData.year_of_study,
        userData.department
    ];
    try {
        const result = await pool.query(query, values);
        return result.rows[0].id;
    } catch (error) {
        console.error("DATABASE ERROR saving user:", error);
        return null;
    }
};

const findStudentByTelegramId = async (telegramId) => {
    const res = await pool.query('SELECT id FROM students WHERE telegram_id = $1', [telegramId]);
    return res.rows[0];
};

const getStudentDetailsById = async (studentId) => {
    const res = await pool.query('SELECT full_name FROM students WHERE id = $1', [studentId]);
    return res.rows[0];
};

const countTodaysRegistrations = async () => {
    const res = await pool.query("SELECT COUNT(*) FROM students WHERE registered_at >= CURRENT_DATE");
    return parseInt(res.rows[0].count);
};

const getAllStudents = async () => {
    const query = "SELECT full_name, department, telegram_id FROM students ORDER BY id ASC;";
    const res = await pool.query(query);
    return res.rows;
};

// --- ADMIN & ORGANIZER FUNCTIONS ---

const getAdminByUsername = async (username) => {
    const res = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    return res.rows[0];
};

const createOrganizer = async (username, plainTextPassword, adminId) => {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(plainTextPassword, salt);
    const res = await pool.query(
        'INSERT INTO organizers (username, password_hash, created_by) VALUES ($1, $2, $3) RETURNING id, username',
        [username, passwordHash, adminId]
    );
    return res.rows[0];
};

const getOrganizerByUsername = async (username) => {
    const res = await pool.query('SELECT * FROM organizers WHERE username = $1', [username]);
    return res.rows[0];
};

// --- EVENT & RESERVATION FUNCTIONS ---

const createEvent = async (eventName, eventDate) => {
    await pool.query('UPDATE events SET is_active = FALSE');
    const res = await pool.query(
        'INSERT INTO events (event_name, event_date, is_active) VALUES ($1, $2, TRUE) RETURNING *',
        [eventName, eventDate]
    );
    return res.rows[0];
};

const getActiveEvent = async () => {
    const res = await pool.query('SELECT * FROM events WHERE is_active = TRUE LIMIT 1');
    return res.rows[0];
};

const createReservation = async (studentId, eventId, attendance, feedback) => {
    const res = await pool.query(
        'INSERT INTO reservations (student_id, event_id, attendance_status, feedback) VALUES ($1, $2, $3, $4) RETURNING *',
        [studentId, eventId, attendance, feedback]
    );
    return res.rows[0];
};

const checkIfReserved = async (studentId, eventId) => {
    const res = await pool.query('SELECT COUNT(*) FROM reservations WHERE student_id = $1 AND event_id = $2', [studentId, eventId]);
    return parseInt(res.rows[0].count) > 0;
};

const getReservations = async () => {
    const query = `
        SELECT
            s.full_name, s.phone_number, s.year_of_study, s.department,
            r.attendance_status, r.feedback, r.attended, r.attended_at,
            e.event_name, e.event_date
        FROM reservations r
        JOIN students s ON r.student_id = s.id
        JOIN events e ON r.event_id = e.id
        WHERE e.is_active = TRUE;
    `;
    const res = await pool.query(query);
    return res.rows;
};

const markAttendance = async (studentId, eventId) => {
    const res = await pool.query(
        `UPDATE reservations
         SET attended = TRUE, attended_at = CURRENT_TIMESTAMP
         WHERE student_id = $1 AND event_id = $2 AND attended = FALSE
         RETURNING id`,
        [studentId, eventId]
    );
    return res.rowCount > 0;
};

const getAttendeesByEventId = async (eventId) => {
    const query = `
        SELECT s.id, s.full_name, s.phone_number, s.department
        FROM reservations r
        JOIN students s ON r.student_id = s.id
        WHERE r.event_id = $1 AND r.attended = TRUE
        ORDER BY s.full_name;
    `;
    const res = await pool.query(query, [eventId]);
    return res.rows;
};

const countActiveEventReservations = async () => {
    const res = await pool.query(`
        SELECT COUNT(*) FROM reservations 
        WHERE event_id = (SELECT id FROM events WHERE is_active = TRUE LIMIT 1)
    `);
    return parseInt(res.rows[0].count);
};

// --- NEW FUNCTION for the Broadcast Feature ---
const getAllStudentTelegramIds = async () => {
    try {
        const res = await pool.query("SELECT telegram_id FROM students");
        return res.rows.map(row => row.telegram_id);
    } catch (error) {
        console.error("Error fetching all student telegram IDs:", error);
        return []; // Return an empty array on error to prevent the bot from crashing
    }
};


module.exports = { 
    initDB,
    saveUser,
    findStudentByTelegramId,
    getStudentDetailsById,
    countTodaysRegistrations,
    getAllStudents,
    getAdminByUsername,
    createOrganizer,
    getOrganizerByUsername,
    createEvent,
    getActiveEvent,
    createReservation,
    checkIfReserved,
    getReservations,
    markAttendance,
    getAttendeesByEventId,
    countActiveEventReservations,
    // --- NEW EXPORT to make the function available to bot.js ---
    getAllStudentTelegramIds
};