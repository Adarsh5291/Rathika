const User = require("../models/User");

const isAdmin = async (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }

    const user = await User.findById(req.session.userId);

    if (!user || user.role !== "admin") {
        return res.status(403).send("Access denied. Admin only.");
    }

    next();
};

module.exports = isAdmin;