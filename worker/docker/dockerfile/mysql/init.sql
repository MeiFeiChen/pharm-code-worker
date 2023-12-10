CREATE USER 'student'@'%' IDENTIFIED BY 'student';
GRANT SELECT ON *.* TO 'student'@'%';
FLUSH PRIVILEGES;

-- Create table If Not Exists Person
CREATE TABLE IF NOT EXISTS Person (
    personId INT,
    firstName VARCHAR(255),
    lastName VARCHAR(255)
);

-- Create table If Not Exists Address
CREATE TABLE IF NOT EXISTS Address (
    addressId INT,
    personId INT,
    city VARCHAR(255),
    state VARCHAR(255)
);

-- Truncate table Person
TRUNCATE TABLE Person;

-- Insert data into Person
INSERT INTO Person (personId, lastName, firstName) VALUES
    ('1', 'Wang', 'Allen'),
    ('2', 'Alice', 'Bob');

-- Truncate table Address
TRUNCATE TABLE Address;

-- Insert data into Address
INSERT INTO Address (addressId, personId, city, state) VALUES
    ('1', '2', 'New York City', 'New York'),
    ('2', '3', 'Leetcode', 'California');
