# Odd Dish Out: connecting the Google Sheet

About 5 minutes, once. You need a Google account. Do this on a computer, not a phone.

## 1. Make the sheet

1. Go to <https://sheets.new>. A blank spreadsheet opens.
2. Name it **Odd Dish Out** (click "Untitled spreadsheet" at the top left).

## 2. Add the script

1. In the menu: **Extensions → Apps Script**. A code editor opens in a new tab.
2. Select everything in the editor and delete it.
3. Open `apps-script/Code.gs` from this folder, copy all of it, and paste it into the editor.
4. Click the **Save** icon (or Cmd+S).

## 3. Run setup once

1. In the toolbar, the function dropdown should say **setup**. If not, pick it.
2. Click **Run**.
3. Google asks for permission the first time:
   - **Review permissions** → choose your account.
   - You'll see "Google hasn't verified this app". That's expected: the app is the script you just pasted. Click **Advanced → Go to (project name) (unsafe)** → **Allow**.
4. Go back to the spreadsheet tab. You now have three tabs: **Settings**, **Dishes**, **Votes**.

## 4. Turn it into a web address

1. Back in the Apps Script tab: **Deploy → New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
   ("Anyone" lets the page reach the script without a Google login. The secret key in your link is what keeps strangers out.)
4. Click **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
5. Paste that URL to Claude, or put it in `config.js` yourself as `apiUrl`.

## 5. Fill in the details

In the **Settings** tab, column B:

| setting | what to type |
|---|---|
| eventTime | e.g. `Doors at 3, dinner at 5` |
| address | your address (shows as a maps link; leave empty to hide) |
| poultry | the bird, once you know. `TBD` shows "to be determined" |
| hostNote | optional extra line (parking, dress code, anything) |
| guests | first names separated by commas, e.g. `Alex, Sam, Jo`. Each shows as a blank in the lineup until that person signs up |

Changes show up on the page within about 30 seconds.

## 6. Send the link

The **shareLink** row in Settings is the link to text the family. It has the secret key built in.

---

## Running the party

- **Fix or remove a sign-up:** edit or delete its row in the **Dishes** tab. Categories are `protein`, `green`, `carb`, `sweet`, `sip`, `wild`.
- **Add one for somebody:** type a new row in **Dishes** (name, dish, category). Leave `id` and `tokenHash` empty.
- **Kitchen column:** what the dish needs on arrival: `none`, `cold`, `hot`, or `oven|350|60` (degrees, minutes). You can edit these by hand.
- **Open the vote on the day:** tick the **votingOpen** box in Settings. Untick to close.
- **Lock everyone out:** change **accessKey** in Settings. The old link stops working; the new shareLink works.
- **See the results later:** the **Votes** tab has one row per vote.

## If you ever change Code.gs

Paste the new code, save, then **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. The URL stays the same.
