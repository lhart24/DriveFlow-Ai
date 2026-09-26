export type ToolName =
  | "search_inventory"
  | "check_availability"
  | "create_appointment"
  | "find_or_create_customer"
  | "create_lead";

interface PropertySchema {
  type: "string" | "number" | "boolean";
  description: string;
}

interface ToolSchema {
  name: ToolName;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, PropertySchema>;
    required?: string[];
  };
}

export const tools: ToolSchema[] = [
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
        vehicleId: { type: "number", description: "Numeric vehicle ID from a prior search_inventory result" },
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
        customerId: { type: "number", description: "Numeric customer ID from a prior find_or_create_customer result" },
        vehicleId: { type: "number", description: "Numeric vehicle ID from a prior search_inventory result" },
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
        name: { type: "string", description: "Customer's full name" },
        email: { type: "string", description: "Customer's email address" },
        phone: { type: "string", description: "Customer's phone number" }
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
        customerId: { type: "number", description: "Numeric customer ID from a prior find_or_create_customer result" },
        vehicleId: { type: "number", description: "Numeric vehicle ID from a prior search_inventory result" },
        enquiry: { type: "string", description: "Summary of what the customer is asking for" }
      },
      required: ["customerId", "enquiry"]
    }
  }
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Lightweight runtime check against the schema above: required fields
 * present, and any field that IS present has the right primitive type.
 * This is what actually gets called from the agent loop before a tool
 * runs — the schema previously existed but nothing consumed it.
 */
export function validateToolInput(
  toolName: string,
  input: Record<string, unknown> | undefined
): ValidationResult {
  const schema = tools.find((t) => t.name === toolName);
  if (!schema) {
    return { valid: false, errors: [`Unknown tool "${toolName}"`] };
  }

  const errors: string[] = [];
  const properties = schema.input_schema.properties;
  const required = schema.input_schema.required || [];

  for (const field of required) {
    const value = input?.[field];
    if (value === undefined || value === null || value === "") {
      errors.push(`Missing required field "${field}"`);
    }
  }

  for (const [key, value] of Object.entries(input || {})) {
    const propSchema = properties[key];
    if (!propSchema) continue; // extra fields are ignored, not an error
    const actualType = typeof value;
    if (propSchema.type !== actualType) {
      errors.push(`Field "${key}" should be a ${propSchema.type}, got ${actualType}`);
    }
  }

  return { valid: errors.length === 0, errors };
}