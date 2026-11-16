# Putting the Benchmark Atlas online

The atlas is a static website: a folder of HTML, CSS, JavaScript, and data files with no server or database behind it. That means it can be hosted for free, it loads quickly, and there is nothing to maintain or patch.

This guide covers three ways to publish it. **Option A (GitHub Pages) is recommended**, because the site then rebuilds itself whenever you upload a new version of the workbook.

Before you start, preview the site on your own computer by double-clicking `site/index.html`. Everything works offline.

---

## Option A: GitHub Pages (free, recommended)

**What you get:** an address like `https://your-name.github.io/mh-benchmark-atlas/`, free HTTPS, and automatic rebuilds. GitHub Pages is free for public repositories. As of this writing, a site can be up to 1 GB, with a soft limit of about 100 GB of traffic per month. The atlas is about 2 MB, so it is far below both limits. Check GitHub's current terms when you sign up.

### One-time setup (about 15 minutes)

1. **Create a GitHub account** at https://github.com/signup, or sign in. A RAND or project organization account works too, and then the address uses the organization's name.

2. **Create a repository.** Click **New repository**. Name it `mh-benchmark-atlas` (the name becomes part of the web address), choose **Public**, and click **Create repository**.

3. **Upload the files.** The easiest reliable way is the free **GitHub Desktop** app (https://desktop.github.com):
   - In GitHub Desktop, choose **File > Clone repository** and pick `mh-benchmark-atlas`. It creates an empty folder on your computer.
   - Copy everything *inside* this `mh-benchmark-atlas` folder into that new folder. Include the hidden `.github` folder. On a Mac, press **Cmd + Shift + .** in Finder to show hidden files.
   - Back in GitHub Desktop, type a summary such as "First version", then click **Commit to main** and **Push origin**.

   *Alternative without the app:* on the repository page, click **Add file > Upload files** and drag in the folders. Browsers won't upload the hidden `.github` folder, so add the publishing workflow by hand. It takes a minute:
   1. On the repository page, click **Add file > Create new file**.
   2. In the file-name box, type `.github/workflows/deploy.yml`. Each `/` you type turns into a folder.
   3. Open `deploy-workflow-for-github.txt`, which sits next to the `mh-benchmark-atlas` folder. Select all, copy, and paste it into the large editing box.
   4. Click **Commit changes**.

4. **Turn on Pages.** In the repository, go to **Settings > Pages**. Under **Build and deployment > Source**, choose **GitHub Actions**.

5. **Wait about a minute.** Open the **Actions** tab to watch the "Build and publish the atlas" job. When it shows a green check, the site is live at `https://your-name.github.io/mh-benchmark-atlas/`. If it ran before you finished step 4, click the job and choose **Re-run all jobs**.

### Updating the data later

1. Save the new workbook with the same sheet and column names.
2. In the repository, open the `data` folder and upload the new workbook (**Add file > Upload files**, then **Commit changes**).
3. Then delete the old one: click the old `.xlsx`, open the **…** menu at the top right of the file view, choose **Delete file**, and commit. (Upload first: deleting first leaves no workbook, so that build fails harmlessly.)
4. The site rebuilds automatically within a minute or two. If both workbooks are briefly present, the build uses the one most recently saved in Excel and notes it in the report.

The build checks the workbook first. If something is wrong, for example a renamed column or a study that lists a benchmark missing from the benchmark sheet, the build stops. **The live site stays as it was** and GitHub emails you. To see what failed, open the failed job in the **Actions** tab and expand "Build the data from the workbook". The same messages are written to `build/validation_report.txt` when you run the build on your own computer.

### Updating the site's code or text

When the site files themselves change (for example, new Methods text), upload the changed folders over the old ones:

1. On the repository's main page, click **Add file > Upload files**.
2. From the `mh-benchmark-atlas` folder on your computer, drag in the `build`, `data`, and `site` folders and any changed top-level files such as `README.md`. GitHub keeps the folder structure and replaces files that have the same name.
3. Click **Commit changes**. Uploading never deletes anything, so remove files that no longer belong (such as an old workbook) one at a time as in step 3 above.
4. Watch the **Actions** tab for the green check.

The workflow file in `.github` only needs to be re-entered if it changes; `deploy-workflow-for-github.txt` always holds the current copy.

### Optional: your own web address

A custom domain such as `mhbenchmarkatlas.org` costs about $10 to $15 a year from any domain registrar. In **Settings > Pages > Custom domain**, enter the domain and follow GitHub's instructions to add a DNS record at your registrar. HTTPS stays free.

### Optional: a citable DOI for the data

Zenodo (https://zenodo.org) can archive the repository and issue a DOI each time you publish a GitHub release, at no cost. Sign in to Zenodo with GitHub, switch on the repository under **GitHub** in your Zenodo account, then create a release in GitHub (**Releases > Draft a new release**).

---

## Option B: Cloudflare Pages (free, drag and drop, no GitHub needed)

**What you get:** an address like `https://mh-benchmark-atlas.pages.dev`. Cloudflare's free plan has unlimited bandwidth. It does not rebuild automatically from the workbook, so you rebuild on your own computer and upload again.

1. Create a free account at https://dash.cloudflare.com/sign-up.
2. Go to **Workers & Pages > Create**, choose the **Pages** option to upload your own files (Cloudflare labels this "Upload assets" or "Direct Upload"), and name the project `mh-benchmark-atlas`.
3. Drag the **`site`** folder (not the whole project folder) into the upload area and click **Deploy**.

To update: replace the workbook in `data/`, run the build (see "Rebuilding on your own computer" below), then open the project in Cloudflare and choose **Create deployment** to upload the `site` folder again.

---

## Option C: hand it to an institutional web team

Give them the `site` folder. It is self-contained, needs no server-side software, and can sit at any address, including a subfolder of an existing site. All links inside it are relative.

---

## Rebuilding on your own computer

You only need this for Option B or C, or to check a new workbook before uploading it. On a Mac, open **Terminal** and run:

```
cd ~/Downloads/"AI-MH Benchmark Website Claude Project"/mh-benchmark-atlas
python3 build/build_data.py
```

It prints `Build OK` or a list of problems, and writes the full report to `build/validation_report.txt`. Nothing needs to be installed: the script uses only the Python that comes with macOS. If macOS asks to install "command line developer tools" the first time, accept.
