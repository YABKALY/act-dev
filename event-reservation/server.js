require('dotenv').config();
const express = require('express');
const bot = require('./bot');
const db = require('./pgdb');
const apiRoutes = require('./api'); // Import the routes defined in api.js

// Initialize the Express application
const app = express();
const port = process.env.API_PORT || 3000;

// --- API Server Setup ---

// 1. Add middleware to parse incoming JSON requests from the admin panel
app.use(express.json());

// 2. Mount the API routes. This tells Express to use the routes from api.js
//    for any incoming requests (e.g., /admin/login).
app.use('/', apiRoutes);


// --- Main Application Startup Logic ---

// We use a self-invoking async function to control the startup order.
(async () => {
    try {
        // Step 1: Initialize the database and all tables.
        // This must be done first.
        await db.initDB();

        // Step 2: Start the Telegram bot.
        // It will now begin polling for messages like /start and /event.
        bot.startBot();

        // Step 3: Start the Express API server.
        // It will now listen for HTTP requests on the specified port.
        app.listen(port, () => {
            console.log(`Admin API server is running and listening on http://localhost:${port}`);
        });

    } catch (error) {
        console.error("Failed to start the application:", error);
        process.exit(1);
    }
})();