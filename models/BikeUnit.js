
const mongoose = require("mongoose");

const bikeUnitSchema = new mongoose.Schema(
    {
        bike: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Bike",
            required: true
        },

        registrationNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true
        },

        status: {
            type: String,
            enum: ["Available", "Maintenance", "Inactive"],
            default: "Available"
        },

        // Used to coordinate simultaneous booking attempts
        allocationVersion: {
            type: Number,
            default: 0,
            select: false
        }
    },
    {
        timestamps: true
    }
);

const BikeUnit = mongoose.model("BikeUnit", bikeUnitSchema);

module.exports = BikeUnit;
