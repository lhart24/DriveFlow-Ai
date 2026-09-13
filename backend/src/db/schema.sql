CREATE TABLE vehicles (
    id SERIAL PRIMARY KEY,
    make VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL
);

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(150),
    phone VARCHAR(30)
);

CREATE TABLE leads (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id),
    vehicle_id INT REFERENCES vehicles(id),
    enquiry TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'new',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id),
    vehicle_id INT REFERENCES vehicles(id),
    appointment_time TIMESTAMP NOT NULL,
    status VARCHAR(30) DEFAULT 'scheduled'
);

INSERT INTO vehicles (make, model, year, price, status)
VALUES
('Toyota', 'RAV4', 2024, 42990, 'available'),
('Toyota', 'Camry', 2023, 35990, 'available'),
('Mazda', 'CX-5', 2023, 34990, 'available'),
('Ford', 'Ranger', 2024, 51990, 'sold'),
('Hyundai', 'Tucson', 2024, 38990, 'available');