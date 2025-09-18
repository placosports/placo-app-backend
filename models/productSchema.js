const mongoose = require("mongoose");

// Product Schema
const productSchema = new mongoose.Schema({
    productName: {
        type: String,
        required: true,
        trim: true
    },
    productCategory: {
        type: String,
        required: true,
        trim: true
    },
    productId: {
        type: String,
        unique: true,
        default: () => `PROD-${Math.floor(100000 + Math.random() * 900000)}` // Auto-generated ID
    },
    details: {
        type: String,
        trim: true
    },
    specifications: {
        type: String,
        trim: true
    },
    information: {
        type: String,
        trim: true
    },
    materialAndCare: {
        type: String,
        trim: true
    },
    reviews: [
        {
            user: { type: String }, // could be user ID or name
            rating: { type: Number, min: 1, max: 5 },
            comment: { type: String, trim: true },
            createdAt: { type: Date, default: Date.now }
        }
    ],
    price: {
        type: Number,
        required: true,
        min: 0
    },
    colourOptions: [
        {
            type: String,
            trim: true
        }
    ],
    inStock: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    images: [
        {
            url: { type: String, required: true },
            public_id: { type: String, required: true } 
        }
    ]
    
});

// Create Product model
const productdb = mongoose.model("products", productSchema);

module.exports = productdb;
