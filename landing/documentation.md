# AttenRider: Attendance Monitoring System

### A Geofencing-Based Rider Attendance and Workforce Monitoring System Using Biometric Facial Recognition

> **Full Title:** "AttenRider: An Attendance Monitoring System for Third-Party Logistics Courier Riders of MKB Corporation Using OpenCV, TensorFlow, and Geofencing"

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [System Identity & Scope](#2-system-identity--scope)
3. [User Roles](#3-user-roles)
4. [System Features](#4-system-features)
   - 4.1 [Authentication Module](#41-authentication-module)
   - 4.2 [Biometric Attendance Module](#42-biometric-attendance-module)
   - 4.3 [Geofencing Module](#43-geofencing-module)
   - 4.4 [Live Rider Monitoring Module](#44-live-rider-monitoring-module)
   - 4.5 [Boundary Violation Detection Module](#45-boundary-violation-detection-module)
   - 4.6 [Notification & Alert Module](#46-notification--alert-module)
   - 4.7 [Workforce Monitoring Dashboard](#47-workforce-monitoring-dashboard)
   - 4.8 [Attendance Management Module](#48-attendance-management-module)
   - 4.9 [Payroll Support Module](#49-payroll-support-module)
   - 4.10 [Reports & Analytics Module](#410-reports--analytics-module)
   - 4.11 [Activity Logging Module](#411-activity-logging-module)
   - 4.12 [Role Management Module](#412-role-management-module)
5. [AI Features](#5-ai-features)
6. [Technologies Used](#6-technologies-used)
7. [System Flow](#7-system-flow)
8. [System Boundaries](#8-system-boundaries)

---

## 1. System Overview

**AttenRider** is a capstone system developed for **MKB Corporation** to address the need for real-time attendance monitoring and workforce visibility of their third-party logistics courier riders.

The system combines **biometric facial recognition** and **geofencing technology** to ensure that rider attendance is accurately recorded, their operational locations are validated, and administrators have full visibility over rider activity during working hours.

---

## 2. System Identity & Scope

### What This System Is

| Category                | Description                                 |
| ----------------------- | ------------------------------------------- |
| **Primary Focus**       | Rider attendance monitoring                 |
| **Secondary Focus**     | Rider workforce monitoring                  |
| **Technology Approach** | Biometric (facial recognition) + Geofencing |
| **Target Client**       | MKB Corporation                             |
| **System Type**         | Web-based monitoring and management system  |

### Main System Focus Areas

- ✅ Rider attendance monitoring
- ✅ Rider workforce monitoring
- ✅ Geofencing-based monitoring
- ✅ Rider operational visibility
- ✅ Admin/HR monitoring

### Out of Scope

- ❌ Parcel tracking
- ❌ Shopee system replacement
- ❌ Customer delivery tracking
- ❌ AI route optimization
- ❌ AI parcel prediction
- ❌ AI delivery prediction

---

## 3. User Roles

The system supports four (4) distinct user roles, each with specific access levels and responsibilities:

| Role        | Description                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------- |
| **Admin**   | Full system access; manages accounts, monitors riders, configures geofences                     |
| **HR**      | Manages attendance records, generates workforce reports, monitors rider activity                |
| **Rider**   | Performs facial recognition time-in/out; subject to geofence validation and location monitoring |
| **Payroll** | Accesses attendance-based payroll computation and summaries                                     |

---

## 4. System Features

### 4.1 Authentication Module

Handles secure system access for all user roles.

**Features:**

- Login system
- Role-based access control (RBAC)
- Secure authentication
- Session management

**Applicable Users:** Admin, HR, Rider, Payroll

---

### 4.2 Biometric Attendance Module

> **Core AI Feature**

The primary attendance recording mechanism of the system, powered by computer vision and deep learning.

**Technologies:**

- OpenCV
- TensorFlow FaceNet

**Features:**

- Facial recognition attendance
- Rider time-in recording
- Rider time-out recording
- Camera verification
- Attendance timestamp logging
- Attendance logs

**Process Flow:**

```
Camera Capture
     ↓
Face Detection (OpenCV)
     ↓
Face Recognition (TensorFlow FaceNet)
     ↓
Attendance Recording
```

---

### 4.3 Geofencing Module

Validates that riders operate within their assigned geographical boundaries.

**Features:**

- Assigned rider zones
- Boundary validation
- Dome/radius-based monitoring
- Geofence verification
- Operational area assignment per rider

**Example:**

> Rider assigned only to the **Talon-Talon zone** will be validated and monitored within that defined area only.

---

### 4.4 Live Rider Monitoring Module

> **Main Workforce Monitoring Feature**

Provides real-time visibility of all active riders during working hours.

**Features:**

- Real-time rider location tracking
- Rider movement monitoring
- Active rider map display
- Online/offline rider status
- Rider current coordinate tracking
- Real-time dashboard updates

**What Admin/HR Sees:**

- Where riders are currently located
- Rider activity during working hours

---

### 4.5 Boundary Violation Detection Module

Works in conjunction with the Geofencing Module to detect and flag unauthorized rider movements.

**Features:**

- Detects out-of-bound riders
- Compares rider coordinates to assigned geofence zone
- Sends alerts when a rider exits their allowed area
- Logs all geofence violations

**Example Alert:**

> _"Rider 2 exited Talon-Talon geofence."_

---

### 4.6 Notification & Alert Module

Delivers real-time alerts to responsible personnel when system events are triggered.

**Alert Types:**

- Out-of-bound alerts
- Attendance notifications
- Inactive rider alerts
- Real-time admin alerts

**Recipients:** Admin, HR

---

### 4.7 Workforce Monitoring Dashboard

The central dashboard for Admin and HR to monitor all rider activity at a glance.

**Features:**

- Total active rider count
- Rider map monitoring panel
- Attendance overview
- Rider status cards
- Rider activity logs
- Geofence violation logs
- Real-time monitoring panel

---

### 4.8 Attendance Management Module

Manages, validates, and organizes all rider attendance data.

**Features:**

- Attendance records
- Attendance history
- Rider attendance validation
- Attendance filtering
- Attendance reports

**Used By:** HR, Admin

---

### 4.9 Payroll Support Module

Provides basic payroll computation based on rider attendance data.

**Features:**

- Attendance-based salary computation
- Total work hours calculation
- Payroll summaries
- Attendance-based reports

**Not Included:**

- ❌ Tax computation
- ❌ Government deductions (SSS, PhilHealth, Pag-IBIG)
- ❌ Banking integration

---

### 4.10 Reports & Analytics Module

Generates reports and analytics for administrative and operational review.

**Features:**

- Attendance reports
- Rider activity reports
- Geofence violation reports
- Workforce summaries
- Rider performance analytics

---

### 4.11 Activity Logging Module

Maintains a complete audit trail of all system and rider activities.

**Logged Events:**

- Login history
- Attendance history
- Rider movement timestamps
- Geofence events
- Monitoring history

---

### 4.12 Role Management Module

Allows the Admin to manage all user accounts and system access levels.

**Admin Controls:**

- Rider account management
- HR account management
- Payroll account management
- Permission configuration
- Access level assignment

---

## 5. AI Features

The system implements the following AI-powered features **only**:

| AI Feature                | Technology            | Purpose                                              |
| ------------------------- | --------------------- | ---------------------------------------------------- |
| **Facial Recognition**    | TensorFlow FaceNet    | Identifies riders during attendance                  |
| **Face Verification**     | OpenCV + TensorFlow   | Validates that the face matches the registered rider |
| **Geofencing Validation** | Geolocation API       | Validates rider location against assigned zone       |
| **Boundary Detection**    | Coordinate Comparison | Detects when a rider exits their assigned geofence   |

> ⚠️ **Clarification:** This system does **not** claim AI route optimization, AI parcel prediction, or AI delivery prediction capabilities.

---

## 6. Technologies Used

| Technology               | Role                                                        |
| ------------------------ | ----------------------------------------------------------- |
| **OpenCV**               | Real-time face detection and image processing               |
| **TensorFlow (FaceNet)** | Deep learning model for facial recognition and verification |
| **Geolocation API**      | Rider coordinate tracking                                   |
| **Geofencing**           | Zone boundary definition and validation                     |

---

## 7. System Flow

The complete operational flow of AttenRider from account creation to report generation:

```
1. Admin Creates Rider Account
          ↓
2. Rider Logs In to the System
          ↓
3. Facial Recognition Attendance (Time-In)
          ↓
4. Geofence Validation (Zone Assignment Verified)
          ↓
5. Location Monitoring Activates (Real-Time Tracking Begins)
          ↓
6. Admin/HR Monitor Riders via Dashboard
          ↓
7. System Detects Boundary Violations (If Any)
          ↓
8. Alerts Sent to Admin/HR (If Out of Bounds)
          ↓
9. Rider Performs Facial Recognition Time-Out
          ↓
10. Location Monitoring Stops
          ↓
11. HR/Payroll Generate Attendance & Payroll Reports
```

---

## 8. System Boundaries

### In Scope

| Feature Area                       | Included |
| ---------------------------------- | -------- |
| Facial recognition attendance      | ✅       |
| Geofencing and boundary monitoring | ✅       |
| Real-time rider location tracking  | ✅       |
| Workforce monitoring dashboard     | ✅       |
| Attendance management              | ✅       |
| Basic payroll computation          | ✅       |
| Violation detection and alerts     | ✅       |
| Reports and analytics              | ✅       |
| Role-based access control          | ✅       |

### Out of Scope

| Feature Area                                  | Included |
| --------------------------------------------- | -------- |
| Parcel or package tracking                    | ❌       |
| Customer-facing delivery tracking             | ❌       |
| Shopee or e-commerce platform integration     | ❌       |
| Government deductions (SSS, PhilHealth, etc.) | ❌       |
| Banking or payroll system integration         | ❌       |
| AI-based route optimization                   | ❌       |
| AI-based delivery prediction                  | ❌       |

---

_AttenRider — MKB Corporation Capstone Project Documentation_
_System: Geofencing-Based Rider Attendance and Workforce Monitoring Using Biometric Facial Recognition_
