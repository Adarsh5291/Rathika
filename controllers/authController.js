const bcrypt = require("bcrypt");
const Booking = require("../models/Booking");
const User = require("../models/User");

const showLoginForm = (req, res) => {
    res.render("auth/login");
};

const loginUser = async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

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

    req.session.userId = user._id;

    const redirectTo = req.query.returnTo || "/dashboard";            //////////////////

    res.redirect(redirectTo);
};

const logoutUser = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send("Could not log out");
        }

        res.redirect("/login");
    });
};

const showDashboard = async (req, res) => {
    const user = await User.findById(req.session.userId);

    if (!user) {
        return res.status(404).send("User not found");
    }

    // Fetch bookings made by the logged-in user
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

    const existingUser = await User.findOne({ email });

    if (existingUser) {
        return res.status(400).send("Email is already registered");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
        name,
        email,
        password: hashedPassword
    });

    req.session.userId = user._id;

    res.send("Registration successful");
};

module.exports = {
    showRegisterForm,
    registerUser,
    showLoginForm,
    loginUser,
    logoutUser,
    showDashboard
};