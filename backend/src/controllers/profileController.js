export function getProfile(req, res) {
  res.json({ user: req.user })
}

