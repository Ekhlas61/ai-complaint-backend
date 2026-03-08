const Report = require('../models/Report');
const Assignment = require('../models/Assignment');
const Comment = require('../models/Comment');
const ReportHistory = require('../models/ReportHistory');


// ✅ CREATE REPORT
exports.createReport = async (req, res) => {
  try {
    const {
      title,
      description,
      latitude,
      longitude,
      locationName,
      department,
      severity,
      deviceInfo,
    } = req.body;

    const report = await Report.create({
      title,
      description,
      location: {
        latitude,
        longitude,
        locationName,
      },
      submittedBy: req.user._id, // from auth middleware
      department,
      severity,
      deviceInfo,
    });

    // 🔥 ADD HISTORY
await ReportHistory.create({
  report: report._id,
  action: 'CREATE_REPORT',
  newValue: title,
  changedBy: req.user._id,
});

    res.status(201).json(report);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ GET ALL REPORTS (Admin / DeptAdmin)
exports.getReports = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('submittedBy', 'fullName email')
      .sort({ createdAt: -1 });

    res.json(reports);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ GET SINGLE REPORT
exports.getReportById = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('submittedBy', 'fullName email');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    res.json(report);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ UPDATE STATUS (Admin only)
exports.updateReportStatus = async (req, res) => {
  try {
    const { status } = req.body;

    // 1️⃣ Find report
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // 2️⃣ Check authorization
    const assignment = await Assignment.findOne({
      report: report._id,
      assignedTo: req.user._id,
    });

    if (
      req.user.role !== 'SysAdmin' &&
      req.user.role !== 'DeptAdmin' &&
      !assignment
    ) {
      return res.status(403).json({
        message: 'Not authorized to update this report',
      });
    }

    // 3️⃣ Save old status
    const oldStatus = report.status;

    // 4️⃣ Update status
    report.status = status;

    await report.save();

    // 5️⃣ Save history 🔥
    await ReportHistory.create({
      report: report._id,
      action: 'UPDATE_STATUS',
      oldValue: oldStatus,
      newValue: status,
      changedBy: req.user._id,
    });

    // 6️⃣ Response
    res.json({
      message: 'Status updated successfully',
      report,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// ✅ ASSIGN REPORT
exports.assignReport = async (req, res) => {
  try {
    const { assignedTo, note } = req.body;

    const reportId = req.params.id;

    const assignment = await Assignment.create({
      report: reportId,
      assignedTo,
      assignedBy: req.user._id,
      assignmentNote: note,
    });


    await ReportHistory.create({
  report: reportId,
  action: 'ASSIGN_REPORT',
  newValue: assignedTo,
  changedBy: req.user._id,
});


    res.status(201).json({
      message: 'Report assigned successfully',
      assignment,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};




// ✅ ADD COMMENT
exports.addComment = async (req, res) => {
  try {
    const { commentText } = req.body;

    const comment = await Comment.create({
      report: req.params.id,
      author: req.user._id,
      commentText,
    });

    await ReportHistory.create({
  report: req.params.id,
  action: 'ADD_COMMENT',
  newValue: req.body.commentText,
  changedBy: req.user._id,
});


    res.status(201).json(comment);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ GET COMMENTS FOR REPORT
exports.getComments = async (req, res) => {
  try {
    const comments = await Comment.find({ report: req.params.id })
      .populate('author', 'fullName email')
      .sort({ createdAt: -1 });

    res.json(comments);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReportHistory = async (req, res) => {
  try {
    const history = await ReportHistory.find({ report: req.params.id })
      .populate('changedBy', 'fullName email')
      .sort({ createdAt: -1 });

    res.json(history);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
