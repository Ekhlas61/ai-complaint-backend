const Complaint = require('../models/Complaint');
const Department = require('../models/Department');
const User = require('../models/User');
const Organization = require('../models/Organization');
const {
  getStats,
  calculateAvgResolutionTime,
  getDeptAvgResolutionTime,
  getDeptHeadWorkload,
  getMonthlyTrends,
  getCurrentMonthStats,
  getPreviousMonthStats,
  getStaleComplaintsCount,
  getInactiveDeptHeads,
  calculatePerformanceScore,
  calculateSLACompliance,
  getResolutionTimeByPriority,
  generateSysAdminRecommendations,
  calculateSystemHealthScore
} = require('../utils/analyticsHelper');

// ========== CONTROLLER FUNCTIONS ==========

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


 // Department Head Analytics with Monthly Trends & SLA
 
const getDeptHeadStats = async (req, res) => {
  try {
    const departmentId = req.user.department;
    if (!departmentId) {
      return res.status(400).json({ message: 'DeptHead not associated with any department' });
    }

    const deptFilter = { department: departmentId };
    
    // 1. Current month trends
    const currentMonth = await getCurrentMonthStats(Complaint, deptFilter);
    const previousMonth = await getPreviousMonthStats(Complaint, deptFilter);
    
    // Calculate month-over-month change
    const monthOverMonthChange = previousMonth.total === 0 
      ? 100 
      : Math.round(((currentMonth.total - previousMonth.total) / previousMonth.total) * 100);
    
    // 2. Overall stats (all time)
    const overallStats = await getStats(Complaint, deptFilter);
    
    // 3. SLA Compliance for resolved complaints
    const allResolvedComplaints = await Complaint.find({
      ...deptFilter,
      status: 'Resolved',
      resolvedAt: { $exists: true }
    }).select('createdAt resolvedAt priority status');
    
    const slaCompliance = calculateSLACompliance(allResolvedComplaints);
    
    // 4. Resolution time by priority
    const resolutionTimeByPriority = await getResolutionTimeByPriority(Complaint, deptFilter);
    
    // 5. Pending complaints breakdown by priority
    const pendingByPriority = await Complaint.aggregate([
      { $match: { department: departmentId, status: { $ne: 'Resolved' } } },
      { $group: { _id: { $ifNull: ['$priority', 'Medium'] }, count: { $sum: 1 } } }
    ]);
    
    const pendingBreakdown = {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0
    };
    pendingByPriority.forEach(item => {
      pendingBreakdown[item._id] = item.count;
    });
    
    // 6. Last 6 months trends (for chart)
    const monthlyTrends = await getMonthlyTrends(Complaint, deptFilter);
    
    res.json({
      currentMonth: {
        ...currentMonth,
        comparisonToPreviousMonth: {
          percentageChange: monthOverMonthChange,
          previousMonthTotal: previousMonth.total,
          previousMonthResolutionRate: previousMonth.resolutionRate
        }
      },
      overall: overallStats,
      sla: {
        overallComplianceRate: slaCompliance.overall,
        totalResolvedComplaints: slaCompliance.totalResolvedComplaints,
        slaCompliantCount: slaCompliance.slaCompliantCount,
        byPriority: slaCompliance.byPriority
      },
      performance: {
        averageResolutionTimeByPriority: resolutionTimeByPriority,
        pendingComplaintsByPriority: pendingBreakdown,
        totalPending: overallStats.pending
      },
      trends: {
        last6Months: monthlyTrends
      },
      summary: {
        receivedThisMonth: currentMonth.total,
        resolvedThisMonth: currentMonth.resolved,
        pendingThisMonth: currentMonth.pending,
        resolutionRateThisMonth: currentMonth.resolutionRate,
        slaComplianceRate: slaCompliance.overall
      }
    });
    
  } catch (err) {
    console.error('DeptHead stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

 // Organization Head Stats


 
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
      const stats = await getStats(Complaint, { department: dept._id });
      const avgResolutionTime = await getDeptAvgResolutionTime(Complaint, dept._id);
      const complaintsLast30Days = await Complaint.countDocuments({
        department: dept._id,
        createdAt: { $gte: new Date(Date.now() - 30*24*60*60*1000) }
      });
      
      // Get SLA compliance for this department
      const deptResolvedComplaints = await Complaint.find({
        department: dept._id,
        status: 'Resolved',
        resolvedAt: { $exists: true }
      }).select('createdAt resolvedAt priority status');
      
      const slaCompliance = calculateSLACompliance(deptResolvedComplaints);
      
      // Get pending complaints by priority (to identify bottlenecks)
      const pendingByPriority = await Complaint.aggregate([
        { 
          $match: { 
            department: dept._id, 
            status: { $ne: 'Resolved' } 
          } 
        },
        { 
          $group: { 
            _id: { $ifNull: ['$priority', 'Medium'] }, 
            count: { $sum: 1 },
            oldestCreatedAt: { $min: '$createdAt' }
          } 
        }
      ]);
      
      const pendingBreakdown = {
        Critical: { count: 0, oldestDays: null },
        High: { count: 0, oldestDays: null },
        Medium: { count: 0, oldestDays: null },
        Low: { count: 0, oldestDays: null }
      };
      
      pendingByPriority.forEach(item => {
        const daysPending = Math.floor((Date.now() - new Date(item.oldestCreatedAt)) / (1000 * 60 * 60 * 24));
        pendingBreakdown[item._id] = {
          count: item.count,
          oldestDays: daysPending
        };
      });
      
      // Determine SLA status for this department
      let slaStatus = 'Good';
      let slaMessage = '';
      
      if (slaCompliance.byPriority.Critical.percentage < 90 && slaCompliance.byPriority.Critical.total > 0) {
        slaStatus = 'Critical';
        slaMessage = `Critical priority SLA failing (${slaCompliance.byPriority.Critical.percentage}% compliance)`;
      } else if (slaCompliance.byPriority.High.percentage < 85 && slaCompliance.byPriority.High.total > 0) {
        slaStatus = 'Warning';
        slaMessage = `High priority SLA below target (${slaCompliance.byPriority.High.percentage}% compliance)`;
      } else if (slaCompliance.overall < 75 && stats.total > 10) {
        slaStatus = 'Attention';
        slaMessage = `Overall SLA compliance below 75%`;
      }
      
      deptStats.push({ 
        departmentId: dept._id, 
        name: dept.name, 
        ...stats,
        avgResolutionTimeHours: avgResolutionTime,
        newComplaintsLast30Days: complaintsLast30Days,
        performanceScore: calculatePerformanceScore(stats.resolvedPercentage, avgResolutionTime),
        sla: {
          overallCompliance: slaCompliance.overall,
          byPriority: slaCompliance.byPriority,
          status: slaStatus,
          message: slaMessage
        },
        pendingBreakdown,
        needsAttention: slaStatus !== 'Good'
      });
      
      overall.total += stats.total;
      overall.resolved += stats.resolved;
      overall.pending += stats.pending;
    }
    overall.resolvedPercentage = overall.total === 0 ? 0 : Math.round((overall.resolved / overall.total) * 100);

    const staleComplaints = await getStaleComplaintsCount(Complaint, 30, { department: { $in: departments.map(d => d._id) } });
    const monthlyTrends = await getMonthlyTrends(Complaint, { department: { $in: departments.map(d => d._id) } });
    
    // Problem departments based on SLA (updated logic)
    const problemDepartments = deptStats
      .filter(d => d.total > 0 && (
        d.sla.overallCompliance < 70 || 
        d.sla.byPriority.Critical.percentage < 90 ||
        d.sla.byPriority.High.percentage < 85 ||
        d.pendingBreakdown.Critical.count > 5 ||
        d.avgResolutionTimeHours > 168
      ))
      .map(d => ({ 
        name: d.name, 
        resolvedPercentage: d.resolvedPercentage, 
        avgTime: d.avgResolutionTimeHours,
        pending: d.pending,
        slaCompliance: d.sla.overallCompliance,
        criticalSLACompliance: d.sla.byPriority.Critical.percentage,
        highSLACompliance: d.sla.byPriority.High.percentage,
        criticalPending: d.pendingBreakdown.Critical.count
      }));
    
    // Top performers (based on SLA compliance + resolution rate)
    const topDepartments = [...deptStats]
      .filter(d => d.total > 0)
      .sort((a, b) => {
        // Sort by SLA compliance first, then resolution rate
        if (a.sla.overallCompliance !== b.sla.overallCompliance) {
          return b.sla.overallCompliance - a.sla.overallCompliance;
        }
        return (b.performanceScore || 0) - (a.performanceScore || 0);
      })
      .slice(0, 3);
    
    // SLA Summary across organization
    const slaSummary = {
      overallCompliance: deptStats.length === 0 ? 0 : 
        Math.round(deptStats.reduce((sum, d) => sum + d.sla.overallCompliance, 0) / deptStats.length),
      criticalCompliance: deptStats.length === 0 ? 0 :
        Math.round(deptStats.reduce((sum, d) => sum + d.sla.byPriority.Critical.percentage, 0) / deptStats.length),
      highCompliance: deptStats.length === 0 ? 0 :
        Math.round(deptStats.reduce((sum, d) => sum + d.sla.byPriority.High.percentage, 0) / deptStats.length),
      mediumCompliance: deptStats.length === 0 ? 0 :
        Math.round(deptStats.reduce((sum, d) => sum + d.sla.byPriority.Medium.percentage, 0) / deptStats.length),
      lowCompliance: deptStats.length === 0 ? 0 :
        Math.round(deptStats.reduce((sum, d) => sum + d.sla.byPriority.Low.percentage, 0) / deptStats.length),
      departmentsAtRisk: deptStats.filter(d => d.sla.overallCompliance < 70).length,
      departmentsWithCriticalBacklog: deptStats.filter(d => d.pendingBreakdown.Critical.count > 3).length
    };
    
    const summary = {
      totalDepartments: departments.length,
      totalComplaints: overall.total,
      resolvedComplaints: overall.resolved,
      pendingComplaints: overall.pending,
      overallResolutionRate: overall.resolvedPercentage,
      staleComplaints,
      avgResolutionTimeHours: await calculateAvgResolutionTimeForOrg(orgId) || 0,
      slaSummary
    };
    
    // Enhanced recommendations with SLA focus
    const recommendations = [];
    
    // Departments failing Critical SLA
    const criticalSLAFailure = deptStats.filter(d => 
      d.sla.byPriority.Critical.percentage < 90 && d.sla.byPriority.Critical.total > 0
    );
    if (criticalSLAFailure.length > 0) {
      recommendations.push({
        type: 'CRITICAL_SLA_VIOLATION',
        priority: 'critical',
        message: `${criticalSLAFailure.length} department(s) failing Critical priority SLA (target: 90% within 24 hours)`,
        departments: criticalSLAFailure.map(d => d.name),
        suggestedAction: 'Immediate review of critical complaint handling process and resource allocation'
      });
    }
    
    // Departments with high priority SLA issues
    const highSLAFailure = deptStats.filter(d => 
      d.sla.byPriority.High.percentage < 85 && d.sla.byPriority.High.total > 0
    );
    if (highSLAFailure.length > 0) {
      recommendations.push({
        type: 'HIGH_PRIORITY_SLA_ISSUE',
        priority: 'high',
        message: `${highSLAFailure.length} department(s) failing High priority SLA (target: 85% within 48 hours)`,
        departments: highSLAFailure.map(d => d.name),
        suggestedAction: 'Review high priority complaint workflows and escalate bottlenecks'
      });
    }
    
    // Critical complaints pending too long
    const criticalBacklog = deptStats.filter(d => d.pendingBreakdown.Critical.count > 3);
    if (criticalBacklog.length > 0) {
      recommendations.push({
        type: 'CRITICAL_BACKLOG',
        priority: 'critical',
        message: `${criticalBacklog.length} department(s) have ${criticalBacklog.reduce((sum, d) => sum + d.pendingBreakdown.Critical.count, 0)} unresolved critical complaints`,
        departments: criticalBacklog.map(d => `${d.name} (${d.pendingBreakdown.Critical.count} pending)`),
        suggestedAction: 'Form tiger team to clear critical complaint backlog immediately'
      });
    }
    
    if (problemDepartments.length > 0) {
      recommendations.push({
        type: 'PERFORMANCE_INTERVENTION',
        priority: 'high',
        message: `${problemDepartments.length} department(s) have low SLA compliance or resolution rates`,
        departments: problemDepartments.map(d => d.name),
        suggestedAction: 'Schedule SLA performance review meetings with department heads'
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
    
    const needsAttention = problemDepartments.length > 0 || 
                          criticalSLAFailure.length > 0 || 
                          criticalBacklog.length > 0;
    
    res.json({ 
      summary, 
      departments: deptStats,
      insights: {
        problemDepartments,
        topPerformers: topDepartments,
        monthlyTrends,
        needsAttention,
        slaHealth: {
          status: slaSummary.overallCompliance >= 85 ? 'Healthy' : 
                  slaSummary.overallCompliance >= 70 ? 'Moderate' : 'Critical',
          departmentsAtRisk: slaSummary.departmentsAtRisk,
          criticalBacklogCount: slaSummary.departmentsWithCriticalBacklog
        }
      },
      recommendations
    });
    
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


 // System Admin Stats

const getSysAdminStats = async (req, res) => {
  try {
    // Get all active organizations
    const organizations = await Organization.find({ isActive: true }).select('_id name createdAt');
    
    // Overall stats across all complaints
    const overallStats = await getStats(Complaint, {});
    
    // Platform-wide metrics
    const resolvedComplaints = await Complaint.find({
      status: 'Resolved',
      resolvedAt: { $exists: true }
    }).select('createdAt resolvedAt');
    
    const avgResolutionTime = calculateAvgResolutionTime(resolvedComplaints);
    const staleComplaints = await getStaleComplaintsCount(Complaint, 30);
    const inactiveHeads = await getInactiveDeptHeads(User, 30);
    const monthlyTrends = await getMonthlyTrends(Complaint);
    
    // Per organization detailed stats
    const orgDetailedStats = await Promise.all(organizations.map(async (org) => {
      const stats = await getStats(Complaint, { organization: org._id });
      
      const orgResolvedComplaints = await Complaint.find({
        organization: org._id,
        status: 'Resolved',
        resolvedAt: { $exists: true }
      }).select('createdAt resolvedAt');
      
      const avgTime = calculateAvgResolutionTime(orgResolvedComplaints);
      const staleCount = await getStaleComplaintsCount(Complaint, 30, { organization: org._id });
      const inactiveOrgHeads = await getInactiveDeptHeads(User, 30, { organization: org._id });
      
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

 // Organization Admin Stats
 
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

// Citizen Stats
 
const getCitizenStats = async (req, res) => {
  try {
    const stats = await getStats(Complaint, { submittedBy: req.user._id });
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