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

export type ProposedAction =
  | {
      type: "appointment";
      input: {
        name: string;
        email: string;
        phone?: string;
        vehicleId: number;
        appointmentTime: string;
      };
    }
  | {
      type: "lead";
      input: {
        name: string;
        email: string;
        phone?: string;
        vehicleId?: number;
        enquiry: string;
      };
    };

export function validateProposedAction(value: unknown): {
  valid: boolean;
  errors: string[];
  action?: ProposedAction;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["Confirmation proposal must be an object"] };
  }

  const proposal = value as Record<string, unknown>;
  if (
    Object.keys(proposal).some((key) => key !== "type" && key !== "input") ||
    !proposal.input ||
    typeof proposal.input !== "object" ||
    Array.isArray(proposal.input)
  ) {
    return { valid: false, errors: ["Confirmation proposal has an invalid shape"] };
  }

  const input = proposal.input as Record<string, unknown>;
  const customerInput = {
    name: input.name,
    email: input.email,
    ...(input.phone === undefined ? {} : { phone: input.phone }),
  };
  const customerValidation = validateToolInput("find_or_create_customer", customerInput);
  const errors = [...customerValidation.errors];

  if (
    typeof input.name === "string" && input.name.length > 100 ||
    typeof input.email === "string" && input.email.length > 150 ||
    typeof input.phone === "string" && input.phone.length > 30
  ) {
    errors.push("Customer name, email, or phone exceeds its allowed length");
  }

  if (proposal.type === "appointment") {
    if (Object.keys(input).some((key) =>
      !["name", "email", "phone", "vehicleId", "appointmentTime"].includes(key)
    )) {
      errors.push("Appointment proposal contains an unexpected field");
    }
    const appointmentValidation = validateToolInput("check_availability", {
      vehicleId: input.vehicleId,
      appointmentTime: input.appointmentTime,
    });
    errors.push(...appointmentValidation.errors);
    if (errors.length > 0) return { valid: false, errors };
    return {
      valid: true,
      errors: [],
      action: {
        type: "appointment",
        input: {
          name: input.name as string,
          email: input.email as string,
          ...(typeof input.phone === "string" ? { phone: input.phone } : {}),
          vehicleId: input.vehicleId as number,
          appointmentTime: input.appointmentTime as string,
        },
      },
    };
  }

  if (proposal.type === "lead") {
    if (Object.keys(input).some((key) =>
      !["name", "email", "phone", "vehicleId", "enquiry"].includes(key)
    )) {
      errors.push("Lead proposal contains an unexpected field");
    }
    const leadValidation = validateToolInput("create_lead", {
      customerId: 1,
      enquiry: input.enquiry,
      ...(input.vehicleId === undefined ? {} : { vehicleId: input.vehicleId }),
    });
    errors.push(...leadValidation.errors);
    if (errors.length > 0) return { valid: false, errors };
    return {
      valid: true,
      errors: [],
      action: {
        type: "lead",
        input: {
          name: input.name as string,
          email: input.email as string,
          ...(typeof input.phone === "string" ? { phone: input.phone } : {}),
          ...(typeof input.vehicleId === "number" ? { vehicleId: input.vehicleId } : {}),
          enquiry: input.enquiry as string,
        },
      },
    };
  }

  return { valid: false, errors: ["Unsupported confirmation action"] };
}

/**
 * Validate model-provided tool input before it reaches the executor.
 */
export function validateToolInput(
  toolName: unknown,
  input: unknown
): ValidationResult {
  const schema =
    typeof toolName === "string" ? tools.find((t) => t.name === toolName) : undefined;
  if (!schema) {
    return { valid: false, errors: [`Unknown tool "${toolName}"`] };
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["Tool input must be an object"] };
  }

  const errors: string[] = [];
  const properties = schema.input_schema.properties;
  const required = schema.input_schema.required || [];
  const values = input as Record<string, unknown>;

  for (const field of required) {
    const value = values[field];
    if (value === undefined || value === null || value === "") {
      errors.push(`Missing required field "${field}"`);
    }
  }

  for (const [key, value] of Object.entries(values)) {
    const propSchema = properties[key];
    if (!propSchema) {
      errors.push(`Unexpected field "${key}"`);
      continue;
    }

    const actualType = typeof value;
    if (propSchema.type !== actualType) {
      errors.push(`Field "${key}" should be a ${propSchema.type}, got ${actualType}`);
      continue;
    }

    if (propSchema.type === "string") {
      const stringValue = value as string;
      if (stringValue.length > 500 || stringValue.trim().length === 0) {
        errors.push(`Field "${key}" must be non-empty and at most 500 characters`);
      }
      const maxLength: Record<string, number> = {
        make: 50,
        model: 50,
        name: 100,
        email: 150,
        phone: 30,
        enquiry: 500,
      };
      if (maxLength[key] !== undefined && stringValue.length > maxLength[key]!) {
        errors.push(`Field "${key}" exceeds its maximum length`);
      }
    }

    if (
      propSchema.type === "number" &&
      (typeof value !== "number" || !Number.isFinite(value) || value <= 0 ||
        ((key === "vehicleId" || key === "customerId") && !Number.isInteger(value)))
    ) {
      errors.push(`Field "${key}" must be a positive finite number`);
    }
  }

  if (schema.name === "search_inventory" && values.maxPrice !== undefined &&
      (typeof values.maxPrice !== "number" || values.maxPrice <= 0 || values.maxPrice > 100_000_000)) {
    errors.push("maxPrice must be greater than 0 and no more than 100000000");
  }

  if (
    (schema.name === "check_availability" || schema.name === "create_appointment") &&
    typeof values.appointmentTime === "string"
  ) {
    const parsedTime = Date.parse(values.appointmentTime);
    const now = Date.now();
    const [year, month, day] = values.appointmentTime.split("T")[0]!.split("-").map(Number);
    const calendarDate = new Date(Date.UTC(year!, month! - 1, day!));
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(values.appointmentTime) ||
      !Number.isFinite(parsedTime) ||
      calendarDate.getUTCFullYear() !== year ||
      calendarDate.getUTCMonth() !== month! - 1 ||
      calendarDate.getUTCDate() !== day ||
      parsedTime <= now ||
      parsedTime > now + 90 * 24 * 60 * 60 * 1000
    ) {
      errors.push("appointmentTime must be a future ISO 8601 datetime within 90 days");
    }
  }

  if (
    schema.name === "find_or_create_customer" &&
    typeof values.email === "string" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
  ) {
    errors.push("email must be a valid email address");
  }

  return { valid: errors.length === 0, errors };
}