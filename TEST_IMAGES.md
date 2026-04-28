# Test Image Upload & Retrieval

## 🚀 Quick Test (5 minutes)

### Step 1: Start Server
```bash
npm start
```

### Step 2: Upload Image + Create Complaint
```bash
# First upload an image
curl -X POST http://localhost:5000/api/uploads \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@path/to/your/image.jpg"

# Copy the returned URL, then create complaint
curl -X POST http://localhost:5000/api/complaints \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Test Complaint with Image",
    "description": "This complaint has an image attachment",
    "organizationId": "507f1f77bcf86cd799439011",
    "attachments": [{"url": "COPIED_URL_FROM_UPLOAD"}]
  }'
```

### Step 3: Get Complaints & Test Images
```bash
# Get your complaints
curl -X GET http://localhost:5000/api/complaints/my-complaints \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Look for attachments.url in the response - it should be a presigned URL with query parameters.**

### Step 4: Test Image URL
Copy the `attachments.url` from the response and paste it in your browser.
**✅ Expected:** Image loads successfully
**❌ If fails:** Check server logs for errors

## 🔍 What to Check

1. **Upload Response:** Should return a presigned URL
2. **Complaint Response:** `attachments.url` should have `?X-Amz-Algorithm=...`
3. **Browser Test:** Image URL should display the image
4. **Server Logs:** No "Error generating presigned URL" messages

## 🛠️ If Images Don't Work

1. Check `.env` has correct AWS credentials
2. Verify S3 bucket exists and file was uploaded
3. Check server console for error messages

The fix ensures images work with private S3 buckets using presigned URLs.
