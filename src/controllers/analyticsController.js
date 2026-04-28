const Complaint = require('../models/Complaint');
const Department = require('../models/Department');
const User = require('../models/User');
const Organization = require('../models/Organization');

// ========== HELPER FUNCTIONS ==========

// Get counts and percentage for a query filter
const getStats = async (filter) => {
  const total = await Complaint.countDocuments(filter);
  const resolved = await Complaint.countDocuments({ ...filter, status: 'Resolved' });
  const pending = total - resolved;
  const resolvedPercentage = total === 0 ? 0 : Math.round((resolved / total) * 100);
  return { total, resolved, pending, resolvedPercentage };
};

// Calculate average resolution time in hours
const calculateAvgResolutionTime = (complaints) => {
  if (!complaints || complaints.length === 0) return 0;
  const totalHours = complaints.reduce((sum, complaint) => {
    if (complaint.resolvedAt && complaint.createdAt) {
      const hours = (complaint.resolvedAt - complaint.createdAt) / (1000 * 60 * 60);
      return sum + hours;
    }
    return sum;
  }, 0);
  return Math.round(totalHours / complaints.length);
};

// Get average resolution time for a department
const getDeptAvgResolutionTime = async (deptId) => {
  const resolved = await Complaint.find({
    department: deptId,
    status: 'Resolved',
    resolvedAt: { $exists: true }
  }).select('createdAt resolvedAt');
  return calculateAvgResolutionTime(resolved);
};

// Get department head workload (complaints per head)
const getDeptHeadWorkload = async (deptId) => {
  const headCount = await User.countDocuments({ 
    role: 'DeptHead', 
    department: deptId,
    isActive: true 
  });
  if (headCount === 0) return 0;
  const complaintCount = await Complaint.countDocuments({ department: deptId });
  return Math.round(complaintCount / headCount);
};

// Get monthly complaint trends
const getMonthlyTrends = async (filter = {}) => {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    
    const count = await Complaint.countDocuments({
      ...filter,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    });
    
    months.push({
      month: startOfMonth.toLocaleString('default', { month: 'short' }),
      year: startOfMonth.getFullYear(),
      count
    });
  }
  return months;
};

// Calculate performance score (0-100)
const calculatePerformanceScore = (resolutionRate, avgTimeHours) => {
  const timeScore = Math.min(100, Math.max(0, 100 - (avgTimeHours / 24)));
  return Math.round((resolutionRate * 0.7) + (timeScore * 0.3));
};

// Get stale complaints (older than X days, not resolved)
const getStaleComplaintsCount = async (days = 30, filter = {}) => {
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - days);
  return await Complaint.countDocuments({
    ...filter,
    status: { $ne: 'Resolved' },
    createdAt: { $lt: staleDate }
  });
};

// Get inactive department heads
const getInactiveDeptHeads = async (days = 30, filter = {}) => {
  const inactiveDate = new Date();
  inactiveDate.setDate(inactiveDate.getDate() - days);
  return await User.countDocuments({
    role: 'DeptHead',
    isActive: true,
    ...filter,
    lastLogin: { $lt: inactiveDate }
  });
};

// Generate SysAdmin recommendations
const generateSysAdminRecommendations = (organizations, avgResolutionTime, staleComplaints) => {
  const recommendations = [];
  
  const strugglingOrgs = organizations.filter(org => org.resolvedPercentage < 60);
  if (strugglingOrgs.length > 0) {
    recommendations.push({
      type: 'INTERVENTION',
      priority: 'high',
      message: `${strugglingOrgs.length} organization(s) have resolution rate below 60%`,
      organizations: strugglingOrgs.map(org => org.name),
      suggestedAction: 'Schedule performance review meetings with organization heads'
    });
  }
  
  const highStaleOrgs = organizations.filter(org => org.staleComplaints > 30);
  if (highStaleOrgs.length > 0) {
    recommendations.push({
      type: 'BACKLOG_CLEARANCE',
      priority: 'high',
      message: `${highStaleOrgs.length} organization(s) have significant backlog (>30 stale complaints)`,
      organizations: highStaleOrgs.map(org => org.name),
      suggestedAction: 'Escalate and request backlog clearance plan'
    });
  }
  
  if (avgResolutionTime > 96) {
    recommendations.push({
      type: 'PLATFORM_OPTIMIZATION',
      priority: 'medium',
      message: `Average resolution time is ${avgResolutionTime} hours, exceeding target of 72 hours`,
      suggestedAction: 'Review platform workflow efficiency and consider automation opportunities'
    });
  }
  
  if (staleComplaints > 200) {
    recommendations.push({
      type: 'SYSTEM_HEALTH',
      priority: 'critical',
      message: `${staleComplaints} stale complaints platform-wide indicates systemic issue`,
      suggestedAction: 'Conduct platform-wide audit and implement SLA monitoring'
    });
  }
  
  return recommendations;
};

// ========== CONTROLLER FUNCTIONS ==========

const getDeptHeadStats = async (req, res) => {
  try {
    const departmentId = req.user.department;
    if (!departmentId) {
      return res.status(400).json({ message: 'DeptHead not associated with any department' });
    }
    const stats = await getStats({ department: departmentId });
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getOrgHeadStats = async (req, res) => {
  try {
    const orgId = req.user.organization;
    if (!orgId) {
      return res.status(403).json({ message: 'Your account is not associated with an organization' });
    }

    const departments = await Department.find({
      organization: orgId,
      isActive: true,
    }).select('_id name');

    // Get complaint-focused metrics
    let overall = { total: 0, resolved: 0, pending: 0, resolvedPercentage: 0 };
    const deptStats = [];
    
    for (const dept of departments) {
      const stats = await getStats({ department: dept._id });
      const avgResolutionTime = await getDeptAvgResolutionTime(dept._id);
      const complaintsLast30Days = await Complaint.countDocuments({
        department: dept._id,
        createdAt: { $gte: new Date(Date.now() - 30*24*60*60*1000) }
      });
      
      deptStats.push({ 
        departmentId: dept._id, 
        name: dept.name, 
        ...stats,
        avgResolutionTimeHours: avgResolutionTime,
        newComplaintsLast30Days: complaintsLast30Days,
        performanceScore: calculatePerformanceScore(stats.resolvedPercentage, avgResolutionTime),
      });
      
      overall.total += stats.total;
      overall.resolved += stats.resolved;
      overall.pending += stats.pending;
    }
    overall.resolvedPercentage = overall.total === 0 ? 0 : Math.round((overall.resolved / overall.total) * 100);

    const staleComplaints = await getStaleComplaintsCount(30, { department: { $in: departments.map(d => d._id) } });
    const monthlyTrends = await getMonthlyTrends({ department: { $in: departments.map(d => d._id) } });
    
    // Problem departments (only those with complaints AND poor performance)
    const problemDepartments = deptStats
      .filter(d => d.total > 0 && (d.resolvedPercentage < 50 || d.avgResolutionTimeHours > 168))
      .map(d => ({ 
        name: d.name, 
        resolvedPercentage: d.resolvedPercentage, 
        avgTime: d.avgResolutionTimeHours,
        pending: d.pending
      }));
    
    // Top performers (only those with complaints)
    const topDepartments = [...deptStats]
      .filter(d => d.total > 0)
      .sort((a, b) => (b.performanceScore || 0) - (a.performanceScore || 0))
      .slice(0, 3);
    
    const summary = {
      totalDepartments: departments.length,
      totalComplaints: overall.total,
      resolvedComplaints: overall.resolved,
      pendingComplaints: overall.pending,
      overallResolutionRate: overall.resolvedPercentage,
      staleComplaints,
      avgResolutionTimeHours: await calculateAvgResolutionTimeForOrg(orgId) || 0 
    };
    
    // Complaint-focused recommendations
    const recommendations = [];
    
    if (problemDepartments.length > 0) {
      recommendations.push({
        type: 'PERFORMANCE_INTERVENTION',
        priority: 'high',
        message: `${problemDepartments.length} department(s) have low resolution rates or slow response times`,
        departments: problemDepartments.map(d => d.name),
        suggestedAction: 'Review department workflows and provide additional training'
      });
    }
    
    if (staleComplaints > 20) {
      recommendations.push({
        type: 'BACKLOG_CLEARANCE',
        priority: 'high',
        message: `${staleComplaints} complaints have been pending for over 30 days`,
        suggestedAction: 'Prioritize clearing stale complaints and investigate root causes'
      });
    }
    
    if (overall.resolvedPercentage < 50 && overall.total > 10) {
      recommendations.push({
        type: 'PROCESS_AUDIT',
        priority: 'medium',
        message: `Overall resolution rate is ${overall.resolvedPercentage}% below target`,
        suggestedAction: 'Conduct end-to-end process audit and identify bottlenecks'
      });
    }
    
    res.json({ 
      summary, 
      departments: deptStats,
      insights: {
        problemDepartments,
        topPerformers: topDepartments,
        monthlyTrends,
        needsAttention: problemDepartments.length > 0
      },
      recommendations
    });
    
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Helper for org average resolution time
const calculateAvgResolutionTimeForOrg = async (orgId) => {
  const departments = await Department.find({ organization: orgId }).select('_id');
  const deptIds = departments.map(d => d._id);
  
  const resolvedComplaints = await Complaint.find({
    department: { $in: deptIds },
    status: 'Resolved',
    resolvedAt: { $exists: true }
  }).select('createdAt resolvedAt');
  
  return calculateAvgResolutionTime(resolvedComplaints);
};
const getSysAdminStats = async (req, res) => {
  try {
    // Get all active organizations
    const organizations = await Organization.find({ isActive: true }).select('_id name createdAt');
    
    // Overall stats across all complaints
    const overallStats = await getStats({});
    
    // Platform-wide metrics
    const resolvedComplaints = await Complaint.find({
      status: 'Resolved',
      resolvedAt: { $exists: true }
    }).select('createdAt resolvedAt');
    
    const avgResolutionTime = calculateAvgResolutionTime(resolvedComplaints);
    const staleComplaints = await getStaleComplaintsCount(30);
    const inactiveHeads = await getInactiveDeptHeads(30);
    const monthlyTrends = await getMonthlyTrends();
    
    // Per organization detailed stats
    const orgDetailedStats = await Promise.all(organizations.map(async (org) => {
      const stats = await getStats({ organization: org._id });
      
      const orgResolvedComplaints = await Complaint.find({
        organization: org._id,
        status: 'Resolved',
        resolvedAt: { $exists: true }
      }).select('createdAt resolvedAt');
      
      const avgTime = calculateAvgResolutionTime(orgResolvedComplaints);
      const staleCount = await getStaleComplaintsCount(30, { organization: org._id });
      const inactiveOrgHeads = await getInactiveDeptHeads(30, { organization: org._id });
      
      return {
        organizationId: org._id,
        name: org.name,
        ...stats,
        avgResolutionTimeHours: avgTime,
        staleComplaints: staleCount,
        inactiveDepartmentHeads: inactiveOrgHeads,
        performanceScore: calculatePerformanceScore(stats.resolvedPercentage, avgTime)
      };
    }));
    
    // Rankings
    const rankedOrgs = [...orgDetailedStats].sort((a, b) => b.performanceScore - a.performanceScore);
    const topPerformers = rankedOrgs.slice(0, 3);
    const needsImprovement = rankedOrgs.filter(org => org.resolvedPercentage < 60);
    
    // Growth trends
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const previousMonth = new Date();
    previousMonth.setMonth(previousMonth.getMonth() - 2);
    
    const currentMonthComplaints = await Complaint.countDocuments({
      createdAt: { $gte: lastMonth }
    });
    const previousMonthComplaints = await Complaint.countDocuments({
      createdAt: { $gte: previousMonth, $lt: lastMonth }
    });
    
    const growthRate = previousMonthComplaints === 0 
      ? 100 
      : Math.round(((currentMonthComplaints - previousMonthComplaints) / previousMonthComplaints) * 100);
    
    // Alerts
    const alerts = [];
    if (staleComplaints > 100) {
      alerts.push({ severity: 'high', message: `${staleComplaints} stale complaints pending over 30 days` });
    }
    if (inactiveHeads > 20) {
      alerts.push({ severity: 'medium', message: `${inactiveHeads} department heads inactive for over 30 days` });
    }
    if (avgResolutionTime > 120) {
      alerts.push({ severity: 'medium', message: `Average resolution time is ${avgResolutionTime} hours (target: <72 hours)` });
    }
    if (needsImprovement.length > 0) {
      alerts.push({ severity: 'high', message: `${needsImprovement.length} organization(s) have resolution rate below 60%` });
    }
    
    // Final response
    res.json({
      overview: {
        ...overallStats,
        avgResolutionTimeHours: avgResolutionTime,
        staleComplaints,
        inactiveDepartmentHeads: inactiveHeads,
        monthlyGrowthRate: growthRate
      },
      trends: {
        monthly: monthlyTrends,
      },
      organizations: {
        all: orgDetailedStats,
        topPerformers,
        needsImprovement: needsImprovement.map(org => ({
          name: org.name,
          resolutionRate: org.resolvedPercentage,
          avgTime: org.avgResolutionTimeHours
        }))
      },
      alerts,
      recommendations: generateSysAdminRecommendations(orgDetailedStats, avgResolutionTime, staleComplaints)
    });
    
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getOrgAdminStats = async (req, res) => {
  try {
    const orgId = req.user.organization;
    if (!orgId) {
      return res.status(403).json({ message: 'Your account is not associated with an organization' });
    }
    
    if (req.user.role !== 'OrgAdmin') {
      return res.status(403).json({ message: 'Access denied. OrgAdmin privileges required.' });
    }
    
    // Get all departments
    const departments = await Department.find({ 
      organization: orgId, 
      isActive: true 
    }).select('_id name createdAt description');
    
    if (departments.length === 0) {
      return res.json({
        summary: {
          totalDepartments: 0,
          totalDepartmentHeads: 0,
          activeDepartmentHeads: 0,
          departmentsWithHeads: 0,
          departmentsWithoutHeads: 0
        },
        departments: [],
        message: 'No active departments found in your organization'
      });
    }
    
    // Get all department heads in this organization
    const allDeptHeads = await User.find({
      role: 'DeptHead',
      organization: orgId,
      isActive: true
    }).select('fullName email department lastLogin isActive');
    
    const totalHeads = allDeptHeads.length;
    
    // Get active heads (logged in within last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const activeHeads = allDeptHeads.filter(head => 
      head.lastLogin && new Date(head.lastLogin) >= weekAgo
    ).length;
    
    // Department head assignment status
    const departmentsWithHeads = departments.filter(dept => 
      allDeptHeads.some(head => head.department && head.department.toString() === dept._id.toString())
    ).length;
    
    const departmentsWithoutHeads = departments.length - departmentsWithHeads;
    
    // Department detailed stats (system focused, not complaint focused)
    const deptDetailedStats = await Promise.all(departments.map(async (dept) => {
      // Find head for this department
      const deptHead = allDeptHeads.find(head => 
        head.department && head.department.toString() === dept._id.toString()
      );
      
      // Get head activity status
      const headLastLogin = deptHead?.lastLogin;
      const isHeadActive = headLastLogin ? new Date(headLastLogin) >= weekAgo : false;
      const headInactiveDays = headLastLogin ? 
        Math.floor((Date.now() - new Date(headLastLogin)) / (1000 * 60 * 60 * 24)) : null;
      
      // Count complaints assigned to this department (for workload context only)
      const totalComplaints = await Complaint.countDocuments({ department: dept._id });
      const complaintsLast30Days = await Complaint.countDocuments({
        department: dept._id,
        createdAt: { $gte: new Date(Date.now() - 30*24*60*60*1000) }
      });
      
      return {
        departmentId: dept._id,
        name: dept.name,
        description: dept.description,
        createdAt: dept.createdAt,
        headInfo: deptHead ? {
          id: deptHead._id,
          name: deptHead.fullName,
          email: deptHead.email,
          isActive: deptHead.isActive,
          lastLogin: deptHead.lastLogin,
          isCurrentlyActive: isHeadActive,
          inactiveDays: headInactiveDays
        } : null,
        metrics: {
          hasHeadAssigned: !!deptHead,
          headStatus: deptHead ? (isHeadActive ? 'Active' : 'Inactive') : 'Unassigned',
          totalComplaintsAssigned: totalComplaints,
          newComplaintsLast30Days: complaintsLast30Days
        }
      };
    }));
    
    // Identify departments needing attention
    const unassignedDepartments = deptDetailedStats.filter(d => !d.headInfo);
    const inactiveHeadDepartments = deptDetailedStats.filter(d => 
      d.headInfo && !d.headInfo.isCurrentlyActive
    );
    
    // Summary
    const summary = {
      totalDepartments: departments.length,
      totalDepartmentHeads: totalHeads,
      activeDepartmentHeads: activeHeads,
      inactiveDepartmentHeads: totalHeads - activeHeads,
      departmentsWithHeads,
      departmentsWithoutHeads,
      departmentsWithActiveHeads: deptDetailedStats.filter(d => d.headInfo?.isCurrentlyActive).length,
      departmentsWithInactiveHeads: inactiveHeadDepartments.length,
      systemHealthScore: calculateSystemHealthScore(departments.length, departmentsWithHeads, activeHeads, totalHeads)
    };
    
    // Recommendations (system-focused)
    const recommendations = [];
    
    if (departmentsWithoutHeads > 0) {
      recommendations.push({
        type: 'HEAD_ASSIGNMENT',
        priority: 'high',
        message: `${departmentsWithoutHeads} department(s) have no department head assigned`,
        departments: unassignedDepartments.map(d => d.name),
        suggestedAction: 'Assign department heads to ensure proper complaint routing and management'
      });
    }
    
    if (inactiveHeadDepartments.length > 0) {
      recommendations.push({
        type: 'HEAD_ENGAGEMENT',
        priority: 'medium',
        message: `${inactiveHeadDepartments.length} department head(s) have been inactive for over 7 days`,
        departments: inactiveHeadDepartments.map(d => d.name),
        suggestedAction: 'Send reminders or investigate why heads are not logging in'
      });
    }
    
    const unassignedRate = (departmentsWithoutHeads / departments.length) * 100;
    if (unassignedRate > 30) {
      recommendations.push({
        type: 'SYSTEM_CONFIGURATION',
        priority: 'high',
        message: `${Math.round(unassignedRate)}% of departments are missing department heads`,
        suggestedAction: 'Complete department head assignments to ensure operational readiness'
      });
    }
    
    const inactiveRate = totalHeads === 0 ? 0 : ((totalHeads - activeHeads) / totalHeads) * 100;
    if (inactiveRate > 50) {
      recommendations.push({
        type: 'TEAM_ENGAGEMENT',
        priority: 'high',
        message: `${Math.round(inactiveRate)}% of department heads are inactive`,
        suggestedAction: 'Conduct team meeting and review system adoption'
      });
    }
    
    res.json({
      summary,
      departments: deptDetailedStats,
      insights: {
        unassignedDepartments: unassignedDepartments.map(d => ({ name: d.name, createdAt: d.createdAt })),
        inactiveHeadsList: inactiveHeadDepartments.map(d => ({ 
          department: d.name, 
          headName: d.headInfo?.name,
          inactiveDays: d.headInfo?.inactiveDays 
        })),
        needsAttention: (departmentsWithoutHeads > 0 || inactiveHeadDepartments.length > 0)
      },
      recommendations
    });
    
  } catch (err) {
    console.error('OrgAdmin stats error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Helper function for system health score
const calculateSystemHealthScore = (totalDepts, deptsWithHeads, activeHeads, totalHeads) => {
  let score = 100;
  
  // Deduct for missing heads (30% weight)
  const missingHeadsRate = totalDepts === 0 ? 0 : ((totalDepts - deptsWithHeads) / totalDepts) * 100;
  score -= missingHeadsRate * 0.3;
  
  // Deduct for inactive heads (20% weight)
  const inactiveRate = totalHeads === 0 ? 0 : ((totalHeads - activeHeads) / totalHeads) * 100;
  score -= inactiveRate * 0.2;
  
  return Math.max(0, Math.round(score));
};

const getCitizenStats = async (req, res) => {
  try {
    const stats = await getStats({ submittedBy: req.user._id });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ========== EXPORTS ==========
module.exports = {
  getDeptHeadStats,
  getOrgHeadStats,
  getSysAdminStats,
  getCitizenStats,
  getOrgAdminStats
};