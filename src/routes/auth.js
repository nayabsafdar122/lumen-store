const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { User } = require('../models');
const validate = require('../middleware/validate');
const { requireAuth, signToken } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../utils/errors');

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

router.post(
  '/register',
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.valid.body;
    if (await User.findOne({ where: { email } })) throw new AppError(409, 'Email is already registered');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash }); // role is always "customer" here
    res.status(201).json({ user: publicUser(user), token: signToken(user) });
  })
);

router.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.valid.body;
    const user = await User.scope('withPassword').findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError(401, 'Invalid email or password');
    }
    res.json({ user: publicUser(user), token: signToken(user) });
  })
);

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch(
  '/me',
  requireAuth,
  validate({ body: z.object({ name: z.string().trim().min(1).max(100) }) }),
  asyncHandler(async (req, res) => {
    await req.user.update({ name: req.valid.body.name });
    res.json({ user: publicUser(req.user) });
  })
);

router.post(
  '/password',
  requireAuth,
  validate({
    body: z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!(await bcrypt.compare(req.valid.body.currentPassword, user.passwordHash))) {
      throw new AppError(400, 'Current password is incorrect');
    }
    await user.update({ passwordHash: await bcrypt.hash(req.valid.body.newPassword, 10) });
    res.json({ ok: true });
  })
);

module.exports = router;
