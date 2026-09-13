// toolExecutor.ts
import * as db from '../db/database.js';

export async function executeTool(name: string, input: any) {
  switch (name) {
    case 'search_inventory':
      return db.searchInventory(input);
    case 'check_availability':
      return { available: await db.checkAvailability(input.vehicleId, input.appointmentTime) };
    case 'create_appointment':
      return db.createAppointment(input.customerId, input.vehicleId, input.appointmentTime);
    case 'find_or_create_customer':
      return db.findOrCreateCustomer(input.name, input.email, input.phone);
    case 'create_lead':
      return db.createLead(input.customerId, input.vehicleId ?? null, input.enquiry);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}