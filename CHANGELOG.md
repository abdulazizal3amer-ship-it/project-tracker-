# Changelog

All notable changes to this project are documented here. Versions follow [SemVer](https://semver.org/).

## [1.0.0] — Unreleased

First release (MVP): every "Must" requirement in `docs/BRD.md`.

### Added
- Email/password sign-in, password reset by email, forced change of the temporary password, 5-attempt lockout, 8-hour idle sign-out.
- Admin user management (create through the `create-user` Edge Function, change role, deactivate).
- Projects with status, members, automatic progress; archive instead of delete.
- Tasks assigned to one or many members (or the whole project) with a shared status and priorities.
- Kanban board with drag and drop, sortable/filterable list view, and a "My tasks" page.
- Comments with @mentions, per-task activity log.
- Real-time in-app notifications (assignment, mention, comment, status change, due tomorrow).
- Dashboard: tasks by status, overdue (oldest first, days late), due this week, project progress, workload per member.
- Arabic (RTL) and English UI.
- Row Level Security on every table with SQL tests per role; business-rule unit tests.
- GitHub Actions: CI, GitHub Pages deploy, weekly backup and keep-alive.
