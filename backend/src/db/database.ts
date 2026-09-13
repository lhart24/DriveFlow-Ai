import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- Tool functions ---

export async function searchInventory(filters: {
  make?: string;
  model?: string;
  maxPrice?: number;
  status?: string;
}) {
  const conditions: string[] = [];
  const values: any[] = [];

  if (filters.make) {
    values.push(filters.make);
    conditions.push(`make ILIKE $${values.length}`);
  }
  if (filters.model) {
    values.push(filters.model);
    conditions.push(`model ILIKE $${values.length}`);
  }
  if (filters.maxPrice) {
    values.push(filters.maxPrice);
    conditions.push(`price <= $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  } else {
    conditions.push(`status = 'available'`); // default to available only
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(`SELECT * FROM vehicles ${where}`, values);
  return result.rows;
}

export async function checkAvailability(vehicleId: number, appointmentTime: string) {
  const result = await pool.query(
    `SELECT * FROM appointments WHERE vehicle_id = $1 AND appointment_time = $2`,
    [vehicleId, appointmentTime]
  );
  return result.rows.length === 0; // true = available
}

export async function createAppointment(customerId: number, vehicleId: number, appointmentTime: string) {
  const result = await pool.query(
    `INSERT INTO appointments (customer_id, vehicle_id, appointment_time)
     VALUES ($1, $2, $3) RETURNING *`,
    [customerId, vehicleId, appointmentTime]
  );
  return result.rows[0];
}

export async function findOrCreateCustomer(name: string, email: string, phone?: string) {
  const existing = await pool.query(`SELECT * FROM customers WHERE email = $1`, [email]);
  if (existing.rows.length > 0) return existing.rows[0];

  const result = await pool.query(
    `INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING *`,
    [name, email, phone ?? null]
  );
  return result.rows[0];
}

export async function createLead(customerId: number, vehicleId: number | null, enquiry: string) {
  const result = await pool.query(
    `INSERT INTO leads (customer_id, vehicle_id, enquiry) VALUES ($1, $2, $3) RETURNING *`,
    [customerId, vehicleId, enquiry]
  );
  return result.rows[0];
}

export async function updateLeadResponse(leadId: number, response: string, status?: string) {
  const result = await pool.query(
    `UPDATE leads SET generated_response = $1, status = COALESCE($2, status) WHERE id = $3 RETURNING *`,
    [response, status ?? null, leadId]
  );
  return result.rows[0];
}