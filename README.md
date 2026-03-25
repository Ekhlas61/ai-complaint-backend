
PROJECT NAME : AI-Assisted Complaint Resolution System- Backend API

OVERVIEW

This is the backend API for the  AI-Assisted Complaint Resolution System, which is a role-based platform that enables utility service organizations to address complaints submited by citizens efficiently and in a timely manner. 

Main Features

- Role-based access control: Citizens, DeptAdmins, OrgAdmins, SysAdmin.

-Citizen:
  - Self-register and login
  - Submit Complaints
  - View their own complaints and status

- DeptAdmin:
  - View complaints assigned to them
  - Update complaint status. for instance, change status from pending to resolved.
  - Add Comments
  - View Dashboard with their assigned complaints and performance metrics

- OrgAdmin: 
  - Create Departments within their organization
  - Manage departments(update, deactivate)
  - Create DeptAdmins and assign them to departments
  - View organization-wide analytics, such as complaints per department.
  - Assign complaints to departments or DeptAdmins

-SysAdmin:
  - Create organizations (EEP,AAWSA, etc.)
  - Manage organizations(update, deactivate)
  - Create OrgAdmins
  - View global analytics for decision-making

- Notifications :  Email, In-app 
- AI integration for auto-assignment, spam/duplicate detection, and priority suggestions.


Tech Stack

- Node.js
- Express
- MongoDB 
- JSON Web Tokens(JWT) for authentication
- bcryptjs for password hashing
- dotenb for environment variables
- cors for cross-orgin requests
- swagger-ui-express and YAML for API documentation
- express-async-handler for async error handling

Prerequisites

- Node.js
- MongoDB(local or Atlas)
- Git


API Documentation

Once the server starts to run, you can view the Swagger documentaition with all the endpoints at:

  - Local: http://localhost:5000/api-docs
  
  - Production: https://ai-complaint-backend-7xc5.onrender.com/api
