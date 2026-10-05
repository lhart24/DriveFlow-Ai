import * as db from '../db/database.js';
import type { ToolName } from './tools.js';

export async function executeTool(name: ToolName, input: Record<string, unknown>) {
  switch (name) {
    case 'search_inventory':
      return db.searchInventory({
        ...(typeof input.make === 'string' ? { make: input.make } : {}),
        ...(typeof input.model === 'string' ? { model: input.model } : {}),
        ...(typeof input.maxPrice === 'number' ? { maxPrice: input.maxPrice } : {}),
      });
    case 'check_availability':
      return {
        available: await db.checkAvailability(
          input.vehicleId as number,
          input.appointmentTime as string,
        ),
      };
    case 'create_appointment':
    case 'find_or_create_customer':
    case 'create_lead':
      throw new Error('Write actions require explicit user confirmation');
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}