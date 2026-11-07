const mongoose = require("mongoose");

const bikeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        brand: {
            type: String,
            required: true,
            trim: true
        },

        type: {
            type: String,
            required: true,
            enum: ["Sports", "Classic", "Cruiser", "Adventure", "Scooter", "Other"]
        },

        pricePerDay: {
            type: Number,
            required: true,
            min: 0
        },

        description: {
            type: String,
            required: true,
            trim: true
        },

        specifications: {
            engine: String,
            mileage: String,
            transmission: String
        },

        image: {
            type: String,
            default: ""
        },
        
        imagePublicId: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

const Bike = mongoose.model("Bike", bikeSchema);

module.exports = Bike;