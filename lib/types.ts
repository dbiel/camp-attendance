export interface Teacher {
  id: string
  name: string
  email: string | null
}

export interface Student {
  id: string
  name: string
  age: number | null
  dorm_room: string | null
  parent_name: string | null
  parent_phone: string | null
  parent_email: string | null
  medical_notes: string | null
  additional_info: Record<string, any> | null
}

export interface CampClass {
  id: string
  name: string
  teacher_id: string
  teacher_name: string
  period: string | null
  start_time: string | null
  end_time: string | null
  location: string | null
}

export interface Enrollment {
  id: string
  student_id: string
  class_id: string
  student_name: string
  class_name: string
}

export interface AttendanceRecord {
  id: string
  student_id: string
  class_id: string
  date: string
  status: 'present' | 'absent' | 'tardy'
  marked_at: string
  updated_at: string
}

export type AttendanceStatus = 'present' | 'absent' | 'tardy' | 'unmarked'
