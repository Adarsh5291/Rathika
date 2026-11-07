
const bcrypt = require("bcrypt");
const Booking = require("../models/Booking");
const User = require("../models/User");

const createUserSession = async (req, userId) => {
    await new Promise((resolve, reject) => {
        req.session.regenerate((error) => {
            if (error) return reject(error);
            resolve();
        });
    });

    req.session.userId = userId;

    await new Promise((resolve, reject) => {
        req.session.save((error) => {
            if (error) return reject(error);
            resolve();
        });
    });
};

const getSafeRedirect = (returnTo) => {
    if (
        typeof returnTo !== "string" ||
        !returnTo.startsWith("/") ||
        returnTo.startsWith("//") ||
        returnTo.includes("\\")
    ) {
        return "/dashboard";
    }

    try {
        const parsedUrl = new URL(returnTo, "http://localhost");

        if (parsedUrl.origin !== "http://localhost") {
            return "/dashboard";
        }

        return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
    } catch {
        return "/dashboard";
    }
};

const showLoginForm = (req, res) => {
    res.render("auth/login");
};

const loginUser = async (req, res) => {
    const { email, password } = req.body;

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password
    ) {
        return res.status(400).send("Email and password are required");
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
        email: normalizedEmail
    });

    if (!user) {
        return res.status(400).send("Invalid email or password");
    }

    const isPasswordCorrect = await bcrypt.compare(
        password,
        user.password
    );

    if (!isPasswordCorrect) {
        return res.status(400).send("Invalid email or password");
    }

    const redirectTo = getSafeRedirect(req.query.returnTo);

    await createUserSession(req, user._id);

    res.redirect(redirectTo);
};

const logoutUser = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send("Could not log out");
        }

        res.clearCookie("connect.sid");
        res.redirect("/login");
    });
};

const showDashboard = async (req, res) => {
    const user = await User.findById(req.session.userId);

    if (!user) {
        return res.status(404).send("User not found");
    }

    const bookings = await Booking.find({
        user: req.session.userId
    })
        .populate({
            path: "bikeUnit",
            populate: {
                path: "bike"
            }
        })
        .sort({ createdAt: -1 });

    res.render("dashboard", {
        user,
        bookings
    });
};

const showRegisterForm = (req, res) => {
    res.render("auth/register");
};

const registerUser = async (req, res) => {
    const { name, email, password } = req.body;

    if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string"
    ) {
        return res.status(400).send("Invalid registration details");
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName || normalizedName.length > 60) {
        return res.status(400).send(
            "Name is required and must be at most 60 characters"
        );
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
        normalizedEmail.length > 254 ||
        !emailPattern.test(normalizedEmail)
    ) {
        return res.status(400).send("Enter a valid email address");
    }

    if (
        password.length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
    ) {
        return res.status(400).send(
            "Password must be at least 8 characters and no more than 72 bytes"
        );
    }

    const existingUser = await User.findOne({
        email: normalizedEmail
    });

    if (existingUser) {
        return res.status(400).send("Email is already registered");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    let user;

    try {
        user = await User.create({
            name: normalizedName,
            email: normalizedEmail,
            password: hashedPassword
        });
    } catch (error) {
        // Handle two registrations using the same email simultaneously
        if (error.code === 11000) {
            return res.status(400).send("Email is already registered");
        }

        throw error;
    }

    await createUserSession(req, user._id);

    res.redirect("/dashboard");
};

module.exports = {
    showRegisterForm,
    registerUser,
    showLoginForm,
    loginUser,
    logoutUser,
    showDashboard
};
