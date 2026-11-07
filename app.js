
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const session = require("express-session");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");

const {
    generateToken,
    csrfSynchronisedProtection
} = require("./middleware/csrf");

const bikeRoutes = require("./routes/bikeRoutes");
const authRoutes = require("./routes/authRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const PORT = 3000;

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing from .env");
}

connectDB();

app.set("view engine", "ejs");

// Security headers.
app.use(
    helmet({
        contentSecurityPolicy: false,
        hsts: process.env.NODE_ENV === "production" ? undefined : false
    })
);

// Static files.
app.use(express.static("public"));

// Parse regular form data and JSON.
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration.
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

// Login rate limiter.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: "Too many login attempts. Please try again after 15 minutes."
});

// Registration rate limiter.
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: "Too many registration attempts. Please try again later."
});

// Apply rate limits to POST requests.
app.use("/login", (req, res, next) => {
    if (req.method === "POST") {
        return loginLimiter(req, res, next);
    }

    next();
});

app.use("/register", (req, res, next) => {
    if (req.method === "POST") {
        return registerLimiter(req, res, next);
    }

    next();
});

// Generate a CSRF token for EJS pages.
app.use((req, res, next) => {
    res.locals.csrfToken = generateToken(req);
    next();
});

// Global CSRF protection.
//
// Bike image forms use multipart/form-data.
// Their CSRF validation is performed inside adminRoutes,
// after Multer has parsed the form fields.
app.use((req, res, next) => {
    const isBikeImageUpload =
        req.method === "POST" &&
        req.is("multipart/form-data") &&
        (
            req.path === "/admin/bikes" ||
            /^\/admin\/bikes\/[^/]+\/edit$/.test(req.path)
        );

    if (isBikeImageUpload) {
        return next();
    }

    csrfSynchronisedProtection(req, res, next);
});

// Routes.
app.use("/", authRoutes);

app.get("/", (req, res) => {
    res.render("home");
});

app.use("/bikes", bikeRoutes);
app.use("/bookings", bookingRoutes);
app.use("/admin", adminRoutes);

// Handle invalid CSRF tokens.
app.use((err, req, res, next) => {
    if (err.code === "EBADCSRFTOKEN") {
        return res.status(403).send(
            "Invalid or expired form submission. Please refresh the page and try again."
        );
    }

    next(err);
});

// Centralized error handler.
app.use(errorHandler);

// Start server.
app.listen(PORT, () => {
    console.log(`Rathika server running on http://localhost:${PORT}`);
});
