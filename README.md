# AI-Assisted Complaint Resolution System - Backend API

## Overview

This is the backend API for the AI-Assisted Complaint Resolution System, a role-based platform that enables utility service organizations to address complaints submitted by citizens efficiently and in a timely manner.

## Main Features

- **Role-based access control**: Citizens, DeptHeads, OrgAdmins, OrgHeads, SysAdmin

### Role Capabilities

#### Citizen:
- Self-register and login
- Submit complaints
- View their own complaints and status

#### DeptHead (Department Head):
- View complaints assigned to their department
- Update complaint status for instance, change status from "Submitted" to "In Progress" or "Resolved".
- Add comments on complaints
- View dashboard with assigned complaints and performance metrics

#### OrgAdmin (Organization Administrator):
- Create departments within their organization
- Manage departments (update, deactivate)
- Create DeptHeads and assign them to departments
- Manage DeptHead accounts (update, deactivate)
- View organization-wide analytics and complaints per department

#### OrgHead (Organization Head):
- View all complaints within their organization
- View department listings (read-only)
- View DeptHead listings (read-only)
- Perform admin overrides on complaints (reassign departments, update priority, mark as spam)
- Add comments on complaints
- View organization-wide analytics for strategic decision-making

#### SysAdmin (System Administrator):
- Create organizations
- Manage organizations (update, deactivate)
- Create OrgAdmins and OrgHeads
- Manage OrgAdmin and OrgHead accounts (update, deactivate)
- View global analytics for decision-making

### Additional Features

- **Notifications**: Email and in-app notifications for status updates and comments
- **AI Integration**: Auto-assignment, spam/duplicate detection, and priority suggestions
- **Audit Logging**: Track all important actions across the system
- **Comments System**: Secure communication between DeptHeads and OrgHeads

## Tech Stack

- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **MongoDB** - Database
- **JSON Web Tokens (JWT)** - Authentication
- **bcryptjs** - Password hashing
- **dotenv** - Environment variables
- **cors** - Cross-origin requests
- **swagger-ui-express & YAML** - API documentation
- **express-async-handler** - Async error handling

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (Atlas)
- Git

## Installation

1. Clone the repository:

```bash
    git clone <repository-url>
    cd ai-complaint-backend
``` 

2. Install dependencies

```bash
    npm install
```

3. Create a .env file in the root directory: 

```env
    PORT=5000
    MONGODB_URI=your_mongodb_connection_string
    JWT_SECRET=your_jwt_secret_key
    JWT_EXPIRE=30d
    EMAIL_HOST=your_smtp_host
    EMAIL_PORT=587
    EMAIL_USER=your_email
    EMAIL_PASS=your_email_password
```

4. Run the application: 

```bash
  # Development mode
    npm run dev

  # Production mode
    npm start
```

## API Documentation

Once the server starts running, you can view the Swagger documentation with all the endpoints at:

Local: http://localhost:5000/api-docs

Production: https://ai-complaint-backend-7xc5.onrender.com/api-


## Project Structure

```
ai-complaint-backend/
├── controllers/      # Route controllers
├── models/          # Database models
├── routes/          # API routes
├── middleware/      # Custom middleware 
├── config/          # Configuration files
├── utils/           # Utility functions
├── docs/            # API documentation
├── .env             # Environment variables
├── .gitignore       # Git ignore file
├── package.json     # Dependencies
└── server.js        # Entry point
```

## Deployment

The API is deployed on Render and can be accessed at:

Base URL: https://ai-complaint-backend-7xc5.onrender.com

API Docs: https://ai-complaint-backend-7xc5.onrender.com/api-docs