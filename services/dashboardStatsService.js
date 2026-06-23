const Appointment = require('../models/Appointment');
const Customer = require('../models/Customer');
const { requireBusinessId, withBusinessId } = require('../utils/tenant');

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getTodayStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function emptyStats() {
  return {
    todayAppointments: 0,
    todayCompletedAppointments: 0,
    todayUpcomingAppointments: 0,
    todayEstimatedRevenue: 0,
    todayActualRevenue: 0,
    totalCustomers: 0,
    upcomingAppointments: 0,
  };
}

/**
 * İşletme (tenant) KPI özeti — count/aggregate; tüm geçmiş çekilmez.
 */
async function getDashboardStats(businessId) {
  const tenantId = requireBusinessId(businessId);
  const { start: todayStart, end: todayEnd } = getTodayRange();
  const upcomingFrom = getTodayStart();

  const [todayAgg, upcomingAppointments, totalCustomers] = await Promise.all([
    Appointment.aggregate([
      {
        $match: withBusinessId(tenantId, {
          appointmentDate: { $gte: todayStart, $lte: todayEnd },
        }),
      },
      {
        $group: {
          _id: null,
          todayAppointments: { $sum: 1 },
          todayCompletedAppointments: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          todayUpcomingAppointments: {
            $sum: {
              $cond: [{ $in: ['$status', ['pending', 'confirmed']] }, 1, 0],
            },
          },
          todayEstimatedRevenue: {
            $sum: {
              $cond: [
                { $ne: ['$status', 'cancelled'] },
                { $ifNull: ['$price', 0] },
                0,
              ],
            },
          },
          todayActualRevenue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'completed'] },
                    { $ne: ['$price', null] },
                    { $gt: ['$price', 0] },
                  ],
                },
                '$price',
                0,
              ],
            },
          },
        },
      },
    ]),
    Appointment.countDocuments(
      withBusinessId(tenantId, {
        appointmentDate: { $gte: upcomingFrom },
        status: { $in: ['pending', 'confirmed'] },
      })
    ),
    Customer.countDocuments(withBusinessId(tenantId, {})),
  ]);

  if (!todayAgg.length) {
    return {
      ...emptyStats(),
      totalCustomers,
      upcomingAppointments,
    };
  }

  const row = todayAgg[0];
  return {
    todayAppointments: row.todayAppointments || 0,
    todayCompletedAppointments: row.todayCompletedAppointments || 0,
    todayUpcomingAppointments: row.todayUpcomingAppointments || 0,
    todayEstimatedRevenue: row.todayEstimatedRevenue || 0,
    todayActualRevenue: row.todayActualRevenue || 0,
    totalCustomers,
    upcomingAppointments,
  };
}

module.exports = {
  getDashboardStats,
  getTodayRange,
  emptyStats,
};
