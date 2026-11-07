
const multer = require("multer");
const { storage } = require("../config/cloudinary");

const fileFilter = (req, file, callback) => {
    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (!allowedTypes.includes(file.mimetype)) {
        return callback(
            new Error("Only JPG, PNG and WebP images are allowed.")
        );
    }

    callback(null, true);
};

const upload = multer({
    storage,
    limits: {
        fileSize: 2 * 1024 * 1024
    },
    fileFilter
});

module.exports = upload;
