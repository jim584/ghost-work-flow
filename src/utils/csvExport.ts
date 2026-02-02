// CSV Export Utility Functions

export const downloadCSV = (data: string, filename: string) => {
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const escapeCSVField = (field: any): string => {
  if (field === null || field === undefined) return '';
  const stringField = String(field);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
};

export const arrayToCSV = (headers: string[], rows: any[][]): string => {
  const headerLine = headers.map(escapeCSVField).join(',');
  const dataLines = rows.map(row => row.map(escapeCSVField).join(','));
  return [headerLine, ...dataLines].join('\n');
};

// Export Tasks to CSV
export const exportTasksToCSV = (tasks: any[], submissions: any[]) => {
  const headers = [
    'Task #',
    'Title',
    'Status',
    'PM Accepted',
    'Created Date',
    'Deadline',
    'Customer Name',
    'Customer Email',
    'Customer Phone',
    'Business Name',
    'Industry',
    'Amount Total',
    'Amount Paid',
    'Amount Pending',
    'Project Manager',
    'Team',
    'Is Upsell',
    'Submissions Count',
    'Latest Submission Status'
  ];

  const rows = tasks.map(task => {
    const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
    const latestSubmission = taskSubmissions.sort((a, b) => 
      new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime()
    )[0];
    
    return [
      task.task_number,
      task.title,
      task.status,
      task.accepted_by_pm ? 'Yes' : 'No',
      task.created_at ? new Date(task.created_at).toLocaleDateString() : '',
      task.deadline || '',
      task.customer_name || '',
      task.customer_email || '',
      task.customer_phone || '',
      task.business_name || '',
      task.industry || '',
      task.amount_total || 0,
      task.amount_paid || 0,
      task.amount_pending || 0,
      task.profiles?.full_name || task.profiles?.email || '',
      task.teams?.name || '',
      task.is_upsell ? 'Yes' : 'No',
      taskSubmissions.length,
      latestSubmission?.revision_status || ''
    ];
  });

  const csv = arrayToCSV(headers, rows);
  const date = new Date().toISOString().split('T')[0];
  downloadCSV(csv, `tasks-export-${date}.csv`);
};

// Export Sales Performance to CSV
export const exportSalesPerformanceToCSV = (
  frontSalesUsers: any[],
  pmUsers: any[],
  salesTargets: any[],
  designerDeveloperUsers: any[],
  submissions: any[]
) => {
  const headers = [
    'Name',
    'Email',
    'Role',
    'Monthly Target',
    'Transferred',
    'Closed',
    'Closed Revenue',
    'Upsell Revenue',
    'Total Achieved',
    'Progress %',
    'Total Submissions',
    'Approved',
    'Needs Revision',
    'Approval Rate %'
  ];

  const rows: any[][] = [];

  // Front Sales users
  frontSalesUsers?.forEach(user => {
    const userTarget = salesTargets?.find(t => t.user_id === user.id);
    const monthlyTarget = userTarget?.monthly_order_target ?? 10;
    const transferred = userTarget?.transferred_orders_count ?? 0;
    const closed = userTarget?.closed_orders_count ?? 0;
    const closedRevenue = Number(userTarget?.closed_revenue ?? 0);
    const totalAchieved = transferred + closed;
    const progress = monthlyTarget > 0 ? ((totalAchieved / monthlyTarget) * 100).toFixed(1) : '0';

    rows.push([
      user.full_name || '',
      user.email,
      'Front Sales',
      monthlyTarget,
      transferred,
      closed,
      closedRevenue,
      0,
      totalAchieved,
      progress,
      '', '', '', ''
    ]);
  });

  // PM users
  pmUsers?.forEach(user => {
    const userTarget = salesTargets?.find(t => t.user_id === user.id);
    const dollarTarget = userTarget?.monthly_dollar_target ?? 0;
    const upsellRevenue = Number(userTarget?.upsell_revenue || 0);
    const totalAchieved = user.closedRevenue + upsellRevenue;
    const progress = dollarTarget > 0 ? ((totalAchieved / dollarTarget) * 100).toFixed(1) : '0';

    rows.push([
      user.full_name || '',
      user.email,
      'Project Manager',
      dollarTarget,
      user.transferredCount || 0,
      user.closedCount || 0,
      user.closedRevenue || 0,
      upsellRevenue,
      totalAchieved,
      progress,
      '', '', '', ''
    ]);
  });

  // Designer/Developer users
  designerDeveloperUsers?.forEach(user => {
    const userRole = user.user_roles?.[0]?.role;
    const userSubmissions = submissions?.filter(s => s.designer_id === user.id) || [];
    const totalSubmissions = userSubmissions.length;
    const approved = userSubmissions.filter(s => s.revision_status === 'approved').length;
    const needsRevision = userSubmissions.filter(s => s.revision_status === 'needs_revision').length;
    const approvalRate = totalSubmissions > 0 ? ((approved / totalSubmissions) * 100).toFixed(1) : '0';

    rows.push([
      user.full_name || '',
      user.email,
      userRole === 'designer' ? 'Designer' : 'Developer',
      '', '', '', '', '', '', '',
      totalSubmissions,
      approved,
      needsRevision,
      approvalRate
    ]);
  });

  const csv = arrayToCSV(headers, rows);
  const date = new Date().toISOString().split('T')[0];
  downloadCSV(csv, `sales-performance-${date}.csv`);
};

// Export Users to CSV
export const exportUsersToCSV = (users: any[], teams: any[], teamMembers: any[]) => {
  const headers = [
    'Name',
    'Email',
    'Role',
    'Team',
    'Created Date'
  ];

  const rows = users?.map(user => {
    const role = user.user_roles?.[0]?.role || 'No role';
    const userTeamMembership = teamMembers?.find(tm => tm.user_id === user.id);
    const team = userTeamMembership ? teams?.find(t => t.id === userTeamMembership.team_id)?.name : '';
    
    return [
      user.full_name || '',
      user.email,
      role,
      team || '',
      user.created_at ? new Date(user.created_at).toLocaleDateString() : ''
    ];
  }) || [];

  const csv = arrayToCSV(headers, rows);
  const date = new Date().toISOString().split('T')[0];
  downloadCSV(csv, `users-export-${date}.csv`);
};
