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
  if (filters.maxPrice !== undefined) {
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
    `SELECT v.id
     FROM vehicles v
     WHERE v.id = $1
       AND v.status = 'available'
       AND NOT EXISTS (
         SELECT 1 FROM appointments a
         WHERE a.vehicle_id = v.id AND a.appointment_time = $2
       )`,
    [vehicleId, appointmentTime]
  );
  return result.rows.length === 1;
}

export async function getVehicleSummary(vehicleId: number) {
  const result = await pool.query(
    `SELECT make, model, year, price, status
     FROM vehicles WHERE id = $1`,
    [vehicleId],
  );
  return result.rows[0] as
    | { make: string; model: string; year: number; price: string; status: string }
    | undefined;
}

export type ConfirmedAction =
  | {
      type: 'appointment';
      name: string;
      email: string;
      phone?: string;
      vehicleId: number;
      appointmentTime: string;
    }
  | {
      type: 'lead';
      name: string;
      email: string;
      phone?: string;
      vehicleId?: number;
      enquiry: string;
    };

async function findOrCreateCustomerWithClient(
  client: import('pg').PoolClient,
  name: string,
  email: string,
  phone?: string,
) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext(LOWER($1)))', [email]);
  const existing = await client.query(
    'SELECT id FROM customers WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email],
  );
  if (existing.rows.length > 0) return existing.rows[0]!;

  const created = await client.query(
    `INSERT INTO customers (name, email, phone)
     VALUES ($1, $2, $3) RETURNING id`,
    [name, email, phone ?? null],
  );
  return created.rows[0]!;
}

export async function executeConfirmedAction(action: ConfirmedAction) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const customer = await findOrCreateCustomerWithClient(
      client,
      action.name,
      action.email,
      action.phone,
    );

    if (action.type === 'appointment') {
      const vehicle = await client.query(
        `SELECT id FROM vehicles
         WHERE id = $1 AND status = 'available'
         FOR UPDATE`,
        [action.vehicleId],
      );
      if (vehicle.rows.length !== 1) {
        throw new Error('The selected vehicle is no longer available.');
      }

      const existingAppointment = await client.query(
        'SELECT id FROM appointments WHERE vehicle_id = $1 AND appointment_time = $2',
        [action.vehicleId, action.appointmentTime],
      );
      if (existingAppointment.rows.length > 0) {
        throw new Error('That test-drive time is no longer available.');
      }

      const appointment = await client.query(
        `INSERT INTO appointments (customer_id, vehicle_id, appointment_time)
         VALUES ($1, $2, $3) RETURNING id`,
        [customer.id, action.vehicleId, action.appointmentTime],
      );
      await client.query('COMMIT');
      return { type: action.type, id: appointment.rows[0]!.id };
    }

    if (action.vehicleId !== undefined) {
      const vehicle = await client.query(
        'SELECT id FROM vehicles WHERE id = $1',
        [action.vehicleId],
      );
      if (vehicle.rows.length !== 1) {
        throw new Error('The selected vehicle no longer exists.');
      }
    }

    const lead = await client.query(
      `INSERT INTO leads (customer_id, vehicle_id, enquiry)
       VALUES ($1, $2, $3) RETURNING id`,
      [customer.id, action.vehicleId ?? null, action.enquiry],
    );
    await client.query('COMMIT');
    return { type: action.type, id: lead.rows[0]!.id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateLeadResponse(leadId: number, response: string, status?: string) {
  const result = await pool.query(
    `UPDATE leads SET generated_response = $1, status = COALESCE($2, status) WHERE id = $3 RETURNING *`,
    [response, status ?? null, leadId]
  );
  return result.rows[0];
}