# Odd Dish Out

A phone-first sign-up page for a Thanksgiving of non-traditional dishes: an audition for the permanent rotation.

- Explains the theme and what the hosts cover.
- Dish sign-up with a loose category, optional servings, dietary tags and notes. The dish itself can stay a surprise.
- Live tally by category with a gentle nudge when the table tilts. Nothing is ever blocked.
- Idea spinner for the undecided.
- Edit or remove your own dish from the phone you used.
- Day-of vote on which dishes earn a permanent spot.

## How it works

A static page (no build step) that reads and writes a Google Sheet through a small Apps Script web app. The link sent to guests carries a secret key after the `#`; the script refuses requests without it, and all event details and sign-ups live in the Sheet, not in this repository.

- `index.html`, `styles.css`, `app.js`: the page
- `lib/potluck.js`: balance, duplicate and edit-token helpers
- `ideas.js`: spinner prompts
- `config.js`: the Apps Script URL
- `mock.js`: in-browser demo backend, used only while `config.js` has no URL (demo link: `index.html#k=test-key`)
- `apps-script/Code.gs`: the Sheet backend
- `SETUP.md`: connecting the Sheet, and running the party

## Credits

- [Alpine.js](https://alpinejs.dev) (MIT)
- [canvas-confetti](https://github.com/catdad/canvas-confetti) (ISC)
- [jcirni/potluck-signup](https://github.com/jcirni/potluck-signup) (MIT): `lib/potluck.js` is ported from its gap analysis, duplicate check, edit-token and maps helpers
- Fonts: Bagel Fat One and Fredoka, via Google Fonts (SIL Open Font License)

See `THIRD-PARTY-LICENSES.md`.
