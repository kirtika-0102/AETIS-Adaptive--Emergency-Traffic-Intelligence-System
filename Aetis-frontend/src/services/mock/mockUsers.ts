import type { UserRole, UserStatus } from "../../types/user.types";

/**
 * Shared by every demo account. This only exists in mock mode (development
 * builds). Never reuse a real password here.
 */
export const MOCK_DEMO_PASSWORD = "Demo@1234";

export interface MockUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  verified: boolean;
  employeeId?: string;
  /** Hospital or station name. Alerts are routed to users by this. */
  organization?: string;
  lastLoginAt?: number;
  createdAt: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function seedUsers(now: number): MockUser[] {
  let n = 0;

  const make = (
    id: string,
    name: string,
    email: string,
    role: UserRole,
    extra: Partial<MockUser> = {}
  ): MockUser => ({
    id,
    name,
    email,
    // Obviously fake numbers, one per user
    phone: `90000001${String(++n).padStart(2, "0")}`,
    role,
    status: "active",
    verified: true,
    createdAt: now - 60 * DAY,
    ...extra,
  });

  const HOSPITAL_1 = "Demo City Hospital";
  const HOSPITAL_2 = "Demo Riverside Hospital";
  const POLICE_1 = "Demo Police Station, Kavi Nagar";
  const FIRE_1 = "Demo Fire Station, Vasundhara";

  return [
    make("U-A01", "Demo Admin", "admin@aetis.example", "admin", {
      employeeId: "EMP-A001",
      lastLoginAt: now - 2 * HOUR,
    }),
    make("U-D01", "Demo Dispatcher", "dispatcher@aetis.example", "dispatcher", {
      employeeId: "EMP-D001",
      lastLoginAt: now - 30 * 60_000,
    }),
    make("U-D02", "Neha Kapoor", "dispatcher2@aetis.example", "dispatcher", {
      employeeId: "EMP-D002",
      lastLoginAt: now - 1 * DAY,
    }),
    // Created but not yet verified: appears under "Pending" and in the admin banner
    make("U-D03", "Karan Malhotra", "pending.dispatcher@aetis.example", "dispatcher", {
      employeeId: "EMP-D003",
      status: "pending",
      verified: false,
      createdAt: now - 2 * HOUR,
    }),
    make("U-D04", "Suspended Dispatcher", "suspended@aetis.example", "dispatcher", {
      employeeId: "EMP-D004",
      status: "suspended",
      lastLoginAt: now - 20 * DAY,
    }),

    make("U-R01", "Demo Driver", "driver@aetis.example", "driver", {
      employeeId: "EMP-R001",
      lastLoginAt: now - 3 * HOUR,
    }),
    make("U-R02", "Amit Yadav", "driver2@aetis.example", "driver", {
      employeeId: "EMP-R002",
      lastLoginAt: now - 5 * HOUR,
    }),
    make("U-R03", "Sunil Tomar", "driver3@aetis.example", "driver", {
      employeeId: "EMP-R003",
    }),
    make("U-R04", "Pooja Singh", "driver4@aetis.example", "driver", {
      employeeId: "EMP-R004",
    }),
    make("U-R05", "Rakesh Chauhan", "driver5@aetis.example", "driver", {
      employeeId: "EMP-R005",
    }),
    make("U-R06", "Imran Qureshi", "driver6@aetis.example", "driver", {
      employeeId: "EMP-R006",
    }),
    make("U-R07", "Vikram Rana", "driver7@aetis.example", "driver", {
      employeeId: "EMP-R007",
    }),
    make("U-R08", "Deepak Mishra", "driver8@aetis.example", "driver", {
      employeeId: "EMP-R008",
    }),
    // Verified drivers with no vehicle yet, for the "Assign driver" list
    make("U-R09", "Anil Gupta", "driver9@aetis.example", "driver", {
      employeeId: "EMP-R009",
    }),
    make("U-R10", "Meena Joshi", "driver10@aetis.example", "driver", {
      employeeId: "EMP-R010",
    }),

    make("U-H01", "Demo Hospital Desk", "hospital@aetis.example", "hospital", {
      organization: HOSPITAL_1,
      lastLoginAt: now - 4 * HOUR,
    }),
    make("U-H02", "Riverside Duty Desk", "hospital2@aetis.example", "hospital", {
      organization: HOSPITAL_2,
    }),
    make("U-P01", "Demo Police Desk", "police@aetis.example", "police", {
      organization: POLICE_1,
    }),
    make("U-F01", "Demo Fire Desk", "fire@aetis.example", "fire", {
      organization: FIRE_1,
    }),
  ];
}