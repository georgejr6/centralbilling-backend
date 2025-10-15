// controllers/user.controller.js
import User from '../models/user.model.js';
import Subscription from '../models/subscription.model.js';

export async function userinfoHandler(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ error: 'missing_user' });
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    const subscription = await Subscription.findOne({ userId: user._id }).lean();
    return res.json({
      sub: String(user._id),
      email: user.email,
      name: user.name,
      subscription: subscription ? {
        planId: subscription.planId,
        status: subscription.status,
        current_period_end: subscription.current_period_end
      } : null
    });
  } catch (err) {
    next(err);
  }
}
