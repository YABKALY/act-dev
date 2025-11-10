const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const db = require('./pgdb');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: false });

// State management for all conversation flows
const userStates = {}; 
const eventStates = {}; 
const broadcastStates = {}; // For the broadcast flow

// Step definitions for each conversation type
const REG_STEPS = { NAME: 'WAITING_FOR_NAME', PHONE: 'WAITING_FOR_PHONE', YEAR: 'WAITING_FOR_YEAR', DEPT: 'WAITING_FOR_DEPT' };
const EVENT_STEPS = { ATTENDANCE: 'WAITING_FOR_ATTENDANCE', FEEDBACK: 'WAITING_FOR_FEEDBACK' };
const BC_STEPS = { IMAGE: 'WAITING_FOR_IMAGE_NAME', CAPTION: 'WAITING_FOR_CAPTION', CONFIRM: 'WAITING_FOR_CONFIRMATION' };

// Load authorized broadcaster IDs from the .env file and split them into an array
const authorizedBroadcasters = (process.env.AUTHORIZED_BROADCAST_IDS || '').split(',');

const startBot = async () => {
    // --- COMMAND HANDLER: /start (No Changes) ---
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const telegramId = msg.from.id;
        const student = await db.findStudentByTelegramId(telegramId);
        if (student) {
            try {
                const uniqueId = student.id;
                const qrCodeBuffer = await QRCode.toBuffer(uniqueId.toString());
                await bot.sendPhoto(chatId, qrCodeBuffer, { caption: "You are already registered! ✅\n\nHere is your QR code again." });
            } catch (err) {
                console.error("In-memory QR generation failed for registered user:", err);
                await bot.sendMessage(chatId, `You are already registered! ✅\n\nYour Unique ID is: ${student.id}`);
            }
        } else {
            userStates[chatId] = { step: REG_STEPS.NAME, data: { telegram_id: telegramId, username: msg.from.username } };
            bot.sendMessage(chatId, "Welcome! Let's get you registered.\n\nPlease enter your Full Name:");
        }
    });

    // --- COMMAND HANDLER: /event (No Changes) ---
    bot.onText(/\/event/, async (msg) => {
        const chatId = msg.chat.id;
        const telegramId = msg.from.id;
        const student = await db.findStudentByTelegramId(telegramId);
        if (!student) return bot.sendMessage(chatId, "Please register with /start before using this command.");
        const activeEvent = await db.getActiveEvent();
        if (!activeEvent) return bot.sendMessage(chatId, "No events are available for reservation right now.");
        const hasReserved = await db.checkIfReserved(student.id, activeEvent.id);
        if (hasReserved) return bot.sendMessage(chatId, "You have already reserved for the current event.");
        eventStates[chatId] = { step: EVENT_STEPS.ATTENDANCE, data: { student_id: student.id, event_id: activeEvent.id } };
        const opts = { reply_markup: { keyboard: [['Yes', 'No', 'Maybe']], one_time_keyboard: true, resize_keyboard: true } };
        bot.sendMessage(chatId, `Event: *${activeEvent.event_name}* on *${activeEvent.event_date}*.\n\nWill you attend?`, { ...opts, parse_mode: 'Markdown' });
    });
    
    // --- NEW COMMAND HANDLER: /broadcast ---
    bot.onText(/\/broadcast/, (msg) => {
        const chatId = msg.chat.id;
        const telegramId = msg.from.id.toString();

        // ** Security Check **
        if (!authorizedBroadcasters.includes(telegramId)) {
            return bot.sendMessage(chatId, "⛔️ You are not authorized to use this command.");
        }

        // Start the broadcast conversation
        broadcastStates[chatId] = {
            step: BC_STEPS.IMAGE,
            data: {}
        };
        bot.sendMessage(chatId, "📢 **Broadcast Mode**\n\nPlease enter the exact name of the image file from the `images` directory (e.g., `announcement.jpg`).", { parse_mode: 'Markdown' });
    });

    // --- CATCH-ALL FOR UNKNOWN COMMANDS (Updated) ---
    bot.onText(/\/(.+)/, (msg, match) => {
        const command = match[1].toLowerCase();
        // Now checks against /broadcast as well
        if (command !== 'start' && command !== 'event' && command !== 'broadcast') {
            bot.sendMessage(msg.chat.id, "Sorry, I don't recognize that command. Please use /start, /event, or /broadcast.");
        }
    });

    // --- MAIN MESSAGE HANDLER (Updated to include Broadcast Flow) ---
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (text && text.startsWith('/')) return;

        // --- Part 1: Registration Flow (No Changes) ---
        if (userStates[chatId]) {
            const currentState = userStates[chatId].step;
            switch(currentState) {
                case REG_STEPS.NAME:
                    userStates[chatId].data.full_name = text;
                    userStates[chatId].step = REG_STEPS.PHONE;
                    const phoneOpts = { reply_markup: { keyboard: [[{ text: 'Share My Phone Number', request_contact: true }]], one_time_keyboard: true, resize_keyboard: true } };
                    bot.sendMessage(chatId, "Got it. Now, please share your Phone Number:", phoneOpts);
                    break;
                case REG_STEPS.PHONE:
                    const phone = msg.contact ? msg.contact.phone_number : text;
                    if (!phone) return bot.sendMessage(chatId, "Invalid input. Please share your phone number.");
                    userStates[chatId].data.phone_number = phone;
                    userStates[chatId].step = REG_STEPS.YEAR;
                    const yearOpts = { reply_markup: { keyboard: [['1st Year', '2nd Year'], ['3rd Year', '4th Year']], one_time_keyboard: true, resize_keyboard: true } };
                    bot.sendMessage(chatId, "Thank you! Please select your Year of Study:", yearOpts);
                    break;
                case REG_STEPS.YEAR:
                    if (!['1st Year', '2nd Year', '3rd Year', '4th Year'].includes(text)) return bot.sendMessage(chatId, "Please select a valid year.");
                    userStates[chatId].data.year_of_study = text;
                    userStates[chatId].step = REG_STEPS.DEPT;
                    const deptOpts = { reply_markup: { keyboard: [['CS', 'BA']], one_time_keyboard: true, resize_keyboard: true } };
                    bot.sendMessage(chatId, "Almost done! Select your Department:", deptOpts);
                    break;
                case REG_STEPS.DEPT:
                    if (!['CS', 'BA'].includes(text)) return bot.sendMessage(chatId, "Please select a valid department.");
                    userStates[chatId].data.department = text;
                    await bot.sendMessage(chatId, "Registering...", { reply_markup: { remove_keyboard: true } });
                    const uniqueId = await db.saveUser(userStates[chatId].data);
                    if (uniqueId) {
                        try {
                            const qrCodeBuffer = await QRCode.toBuffer(uniqueId.toString());
                            await bot.sendPhoto(chatId, qrCodeBuffer, { caption: `You are registered! ✅\n\nYour Unique ID: ${uniqueId}\nPlease save this QR code.` });
                        } catch (err) {
                            console.error("In-memory QR Code generation failed:", err);
                            bot.sendMessage(chatId, `Registered successfully! ✅ Your ID is: ${uniqueId}.`);
                        }
                    } else {
                        bot.sendMessage(chatId, "An error occurred during registration.");
                    }
                    delete userStates[chatId];
                    break;
            }
        } 
        // --- Part 2: Event Reservation Flow (No Changes) ---
        else if (eventStates[chatId]) {
            const currentStep = eventStates[chatId].step;
            switch(currentStep) {
                case EVENT_STEPS.ATTENDANCE:
                    if (!['Yes', 'No', 'Maybe'].includes(text)) return bot.sendMessage(chatId, "Please select an option from the buttons.");
                    eventStates[chatId].data.attendance = text;
                    eventStates[chatId].step = EVENT_STEPS.FEEDBACK;
                    const feedbackOpts = { reply_markup: { keyboard: [['Good', 'Bad', 'Nice']], one_time_keyboard: true, resize_keyboard: true } };
                    bot.sendMessage(chatId, "Thank you! How was your experience at the last event?", feedbackOpts);
                    break;
                case EVENT_STEPS.FEEDBACK:
                    if (!['Good', 'Bad', 'Nice'].includes(text)) return bot.sendMessage(chatId, "Please select an option.");
                    eventStates[chatId].data.feedback = text;
                    await bot.sendMessage(chatId, "Saving your reservation...", { reply_markup: { remove_keyboard: true } });
                    const { student_id, event_id, attendance, feedback } = eventStates[chatId].data;
                    const reservation = await db.createReservation(student_id, event_id, attendance, feedback);
                    if (reservation) {
                        try {
                            const qrCodeBuffer = await QRCode.toBuffer(student_id.toString());
                            await bot.sendPhoto(chatId, qrCodeBuffer, { caption: "Reservation confirmed! ✅\n\nThis is your identification. Please come with this QR code." });
                        } catch (err) {
                             console.error("In-memory QR generation failed for reservation:", err);
                             await bot.sendMessage(chatId, `Reservation confirmed! ✅ Your ID is ${student_id}.`);
                        }
                    } else {
                        await bot.sendMessage(chatId, "Sorry, we could not save your reservation.");
                    }
                    delete eventStates[chatId];
                    break;
            }
        }
        // --- Part 3: NEW Broadcast Flow ---
        else if (broadcastStates[chatId]) {
            const currentStep = broadcastStates[chatId].step;
            switch (currentStep) {
                case BC_STEPS.IMAGE:
                    const imageName = text;
                    const imagePath = path.join(__dirname, 'images', imageName);
                    if (!fs.existsSync(imagePath)) {
                        return bot.sendMessage(chatId, "❌ File not found. Please check the `images` directory and enter a valid file name.");
                    }
                    broadcastStates[chatId].data.imagePath = imagePath;
                    broadcastStates[chatId].step = BC_STEPS.CAPTION;
                    bot.sendMessage(chatId, "✅ Image found.\n\nNow, please enter the caption for the message.");
                    break;
                case BC_STEPS.CAPTION:
                    broadcastStates[chatId].data.caption = text;
                    broadcastStates[chatId].step = BC_STEPS.CONFIRM;
                    const confirmOpts = { reply_markup: { keyboard: [['YES, SEND IT'], ['NO, CANCEL']], one_time_keyboard: true, resize_keyboard: true } };
                    bot.sendMessage(chatId, "Here is a preview of your message:");
                    await bot.sendPhoto(chatId, broadcastStates[chatId].data.imagePath, { caption: text });
                    await bot.sendMessage(chatId, "\nAre you sure you want to broadcast this message to all registered users?", confirmOpts);
                    break;
                case BC_STEPS.CONFIRM:
                    if (text !== 'YES, SEND IT') {
                        delete broadcastStates[chatId];
                        return bot.sendMessage(chatId, "Broadcast cancelled.", { reply_markup: { remove_keyboard: true } });
                    }
                    await bot.sendMessage(chatId, "🚀 Broadcasting message... This may take a while. Please wait.", { reply_markup: { remove_keyboard: true } });
                    const allUserIds = await db.getAllStudentTelegramIds();
                    let successCount = 0;
                    let failCount = 0;
                    for (const userId of allUserIds) {
                        try {
                            await bot.sendPhoto(userId, broadcastStates[chatId].data.imagePath, { caption: broadcastStates[chatId].data.caption });
                            successCount++;
                            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay to prevent rate-limiting
                        } catch (error) {
                            console.error(`Failed to send message to user ${userId}:`, error.response ? error.response.body.description : error.message);
                            failCount++;
                        }
                    }
                    await bot.sendMessage(chatId, `✅ Broadcast Complete!\n\nSent successfully: ${successCount}\nFailed (likely blocked the bot): ${failCount}`);
                    delete broadcastStates[chatId];
                    break;
            }
        }
    });
    // Clear any pending updates (backlog) before starting polling
    try {
    await bot.deleteWebHook({ drop_pending_updates: true }); // node-telegram-bot-api uses deleteWebHook
    } catch (e) {
    // Fallback for environments that expose deleteWebhook (lowercase 'h')
    try { await bot.deleteWebhook({ drop_pending_updates: true }); } catch (_) {}
    }

    // Now start polling fresh (no old messages)
    await bot.startPolling({ params: { timeout: 50 } });

    console.log('Bot is running and polling for updates...');
};

module.exports = { startBot };