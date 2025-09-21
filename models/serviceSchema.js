const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({
  serviceName: {
    type: String,
    required: true,
    enum: ["badminton_stringing", "badminton_repair", "racquet_maintenance", "grip_replacement"]
  },
  displayName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  estimatedDays: {
    type: Number,
    required: true,
    default: 3
  },
  isActive: {
    type: Boolean,
    default: true
  },
  image: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

const serviceBookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      // Generate default bookingId immediately
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `SB${timestamp}${random}`;
    }
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Service",
    required: true
  },
  customerDetails: {
    fullName: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  },
  racquetDetails: {
    brand: {
      type: String,
      required: true
    },
    model: {
      type: String,
      required: false
    },
    stringType: {
      type: String,
      required: false // Only for stringing service
    },
    stringTension: {
      type: String,
      required: false // Only for stringing service
    },
    issueDescription: {
      type: String,
      required: false // Required for repair services
    },
    images: [{
      url: String,
      public_id: String
    }]
  },
  pickupAddress: {
    addressLine1: {
      type: String,
      required: true
    },
    addressLine2: String,
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    pincode: {
      type: String,
      required: true
    },
    country: {
      type: String,
      default: "India"
    }
  },
  paymentDetails: {
    method: {
      type: String,
      enum: ["COD", "PAID_TO_SELLER", "PAY_AT_SHOP", "PAID_ONLINE"],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING"
    },
    paymentProof: {
      url: String,
      public_id: String
    }
  },
  status: {
    type: String,
    enum: [
      "BOOKING_CONFIRMED",
      "PICKUP_SCHEDULED", 
      "RACQUET_COLLECTED",
      "WORK_IN_PROGRESS",
      "WORK_COMPLETED",
      "READY_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED"
    ],
    default: "BOOKING_CONFIRMED"
  },
  timeline: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    description: String
  }],
  scheduledPickupDate: {
    type: Date,
    required: false
  },
  estimatedDeliveryDate: {
    type: Date,
    required: false
  },
  actualDeliveryDate: {
    type: Date,
    required: false
  },
  notes: {
    customer: String,
    technician: String,
    admin: String
  }
}, {
  timestamps: true
});

// Generate a more sophisticated booking ID before saving
serviceBookingSchema.pre('save', async function(next) {
  if (this.isNew && (!this.bookingId || this.bookingId.includes('SB'))) {
    try {
      // Use this.constructor instead of mongoose.model to avoid circular reference
      const count = await this.constructor.countDocuments();
      const timestamp = Date.now().toString().slice(-6);
      const counter = (count + 1).toString().padStart(3, '0');
      this.bookingId = `SB${timestamp}${counter}`;
    } catch (error) {
      // Fallback if count fails - keep the default generated ID
      console.warn('Error generating sophisticated bookingId, using default:', error.message);
    }
  }
  
  // Set estimated delivery date
  if (!this.estimatedDeliveryDate && this.service) {
    try {
      const Service = mongoose.model('Service');
      const service = await Service.findById(this.service);
      if (service) {
        const estimatedDate = new Date();
        estimatedDate.setDate(estimatedDate.getDate() + service.estimatedDays);
        this.estimatedDeliveryDate = estimatedDate;
      }
    } catch (error) {
      console.error('Error setting estimated delivery date:', error);
    }
  }
  
  next();
});

// Add timeline entry when status changes
serviceBookingSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isNew) {
    this.timeline.push({
      status: this.status,
      timestamp: new Date(),
      description: getStatusDescription(this.status)
    });
  }
  next();
});

function getStatusDescription(status) {
  const descriptions = {
    "BOOKING_CONFIRMED": "Your service booking has been confirmed",
    "PICKUP_SCHEDULED": "Pickup has been scheduled",
    "RACQUET_COLLECTED": "Your racquet has been collected",
    "WORK_IN_PROGRESS": "Work is in progress on your racquet",
    "WORK_COMPLETED": "Work has been completed",
    "READY_FOR_DELIVERY": "Your racquet is ready for delivery",
    "DELIVERED": "Your racquet has been delivered",
    "CANCELLED": "Service booking has been cancelled"
  };
  return descriptions[status] || "Status updated";
}

const Service = mongoose.model("Service", serviceSchema);
const ServiceBooking = mongoose.model("ServiceBooking", serviceBookingSchema);

module.exports = { Service, ServiceBooking };