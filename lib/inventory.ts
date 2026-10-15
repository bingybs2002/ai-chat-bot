export type Vehicle = {
  VehicleName: string;
  /** Units on the lot right now; 0 means sold out (orders and waitlist only). */
  available: number;
  /** Dealer price in USD, before tax, title, registration, and destination. */
  Price: number;
  Year: number;
  BodyStyle: "Coupe" | "Sedan" | "Wagon" | "Roadster" | "SUV";
  Seats: number;
  Powertrain: "Gas" | "Electric";
  accelerationTo60inSec: number;
  /** 1 (needs constant attention) to 10 (bulletproof). */
  Reliability: number;
  /** USD per month: 60-month loan at 7% APR with 10% down, plus insurance, fuel/charging, and maintenance. */
  EstimatedMonthlyCost: number;
  /** 1 (pure commuter) to 10 (track-day grin machine). */
  FunMeter: number;
};

export const INVENTORY: Vehicle[] = [
  { VehicleName: "BMW M2 Coupe", available: 4, Price: 66100, Year: 2026, BodyStyle: "Coupe", Seats: 4, Powertrain: "Gas", accelerationTo60inSec: 3.9, Reliability: 7, EstimatedMonthlyCost: 1630, FunMeter: 9 },
  { VehicleName: "BMW M3 Competition xDrive Sedan", available: 5, Price: 87000, Year: 2026, BodyStyle: "Sedan", Seats: 5, Powertrain: "Gas", accelerationTo60inSec: 3.4, Reliability: 7, EstimatedMonthlyCost: 2100, FunMeter: 9 },
  { VehicleName: "BMW M4 Competition xDrive Coupe", available: 6, Price: 91000, Year: 2026, BodyStyle: "Coupe", Seats: 4, Powertrain: "Gas", accelerationTo60inSec: 3.4, Reliability: 7, EstimatedMonthlyCost: 2170, FunMeter: 9 },
  { VehicleName: "BMW M4 CS", available: 0, Price: 124000, Year: 2025, BodyStyle: "Coupe", Seats: 4, Powertrain: "Gas", accelerationTo60inSec: 3.2, Reliability: 7, EstimatedMonthlyCost: 2960, FunMeter: 10 },
  { VehicleName: "BMW M5 Touring", available: 1, Price: 122000, Year: 2026, BodyStyle: "Wagon", Seats: 5, Powertrain: "Gas", accelerationTo60inSec: 3.5, Reliability: 6, EstimatedMonthlyCost: 2920, FunMeter: 9 },
  { VehicleName: "BMW M340i xDrive Sedan", available: 5, Price: 61000, Year: 2026, BodyStyle: "Sedan", Seats: 5, Powertrain: "Gas", accelerationTo60inSec: 4.1, Reliability: 8, EstimatedMonthlyCost: 1540, FunMeter: 8 },
  { VehicleName: "BMW Z4 M40i Handschalter (6-speed manual)", available: 2, Price: 76000, Year: 2026, BodyStyle: "Roadster", Seats: 2, Powertrain: "Gas", accelerationTo60inSec: 4.2, Reliability: 7, EstimatedMonthlyCost: 1800, FunMeter: 9 },
  { VehicleName: "BMW X5 xDrive40i", available: 8, Price: 67000, Year: 2026, BodyStyle: "SUV", Seats: 5, Powertrain: "Gas", accelerationTo60inSec: 5.3, Reliability: 8, EstimatedMonthlyCost: 1640, FunMeter: 5 },
  { VehicleName: "BMW X7 xDrive40i (3-row)", available: 5, Price: 85000, Year: 2026, BodyStyle: "SUV", Seats: 7, Powertrain: "Gas", accelerationTo60inSec: 5.6, Reliability: 7, EstimatedMonthlyCost: 2060, FunMeter: 4 },
  { VehicleName: "BMW iX xDrive60", available: 4, Price: 88000, Year: 2026, BodyStyle: "SUV", Seats: 5, Powertrain: "Electric", accelerationTo60inSec: 4.4, Reliability: 7, EstimatedMonthlyCost: 2020, FunMeter: 5 },
  { VehicleName: "BMW 1 Series M Coupe (pre-owned, 22,000 miles)", available: 1, Price: 70000, Year: 2011, BodyStyle: "Coupe", Seats: 4, Powertrain: "Gas", accelerationTo60inSec: 4.7, Reliability: 6, EstimatedMonthlyCost: 1850, FunMeter: 10 },
  { VehicleName: "BMW M3 Coupe E46 6-speed (pre-owned, 61,000 miles)", available: 1, Price: 45000, Year: 2006, BodyStyle: "Coupe", Seats: 4, Powertrain: "Gas", accelerationTo60inSec: 4.8, Reliability: 5, EstimatedMonthlyCost: 1300, FunMeter: 9 },
];
