// tools.ts
export const tools = [
  {
    name: "search_inventory",
    description: "Search available vehicles by make, model, or max price. Use this when a customer asks about vehicle availability or wants to browse options.",
    input_schema: {
      type: "object",
      properties: {
        make: { type: "string", description: "Vehicle manufacturer, e.g. Toyota" },
        model: { type: "string", description: "Vehicle model, e.g. RAV4" },
        maxPrice: { type: "number", description: "Maximum price in AUD" }
      }
    }
  },
  {
    name: "check_availability",
    description: "Check if a specific vehicle is free for a test drive at a given date/time.",
    input_schema: {
      type: "object",
      properties: {
        vehicleId: { type: "number" },
        appointmentTime: { type: "string", description: "ISO 8601 datetime" }
      },
      required: ["vehicleId", "appointmentTime"]
    }
  },
  {
    name: "create_appointment",
    description: "Book a confirmed test-drive appointment. Only call after confirming availability.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "number" },
        vehicleId: { type: "number" },
        appointmentTime: { type: "string", description: "ISO 8601 datetime" }
      },
      required: ["customerId", "vehicleId", "appointmentTime"]
    }
  },
  {
    name: "find_or_create_customer",
    description: "Look up a customer by email, or create a new record if they don't exist yet.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" }
      },
      required: ["name", "email"]
    }
  },
  {
    name: "create_lead",
    description: "Log a new customer enquiry as a lead against a customer and optionally a specific vehicle.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "number" },
        vehicleId: { type: "number" },
        enquiry: { type: "string" }
      },
      required: ["customerId", "enquiry"]
    }
  }
];