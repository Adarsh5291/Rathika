const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const bikeRoutes = require("./routes/bikeRoutes");
const authRoutes = require("./routes/authRoutes");
const session = require("express-session");
const bookingRoutes = require("./routes/bookingRoutes");

dotenv.config();

const app = express();

const PORT = 3000;

connectDB();

app.set("view engine", "ejs");

app.use(express.static("public"));

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false
    })
);

app.use(express.urlencoded({ extended: true }));

app.use("/", authRoutes);

app.get("/", (req, res) => {
    res.render("home");
});

app.use("/bikes", bikeRoutes);

app.use("/bookings", bookingRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Rathika server running on http://localhost:${PORT}`);
});