# 🧯Troubleshoot Set Up

Run into issues? Here are common problems and quick fixes to get you back on track.  

Add and document more troubleshoot issues here as they are found.  

<br/>

[ADD NEW ISSUE HERE]

<br />

## Login on localhost asks for captcha or shows a captcha error

**Description:** On web or Expo, login shows a captcha message or the security modal fails even though you expect to sign in quickly on localhost.

**Steps to resolve:**

1. Read `Documents/Guides/General/t1-2026-workflow-and-local-development.md` section **Authentication and captcha**.
2. In development, captcha is **off by default** so you can log in without hCaptcha. Restart the dev server after changing `mobile-app/config/captchaConfig.ts` or environment variables.
3. If you set `EXPO_PUBLIC_CAPTCHA_ENABLED=true`, add **localhost** (and your dev port if required) to your hCaptcha site key allowed hostnames in the hCaptcha dashboard, and set `EXPO_PUBLIC_HCAPTCHA_SITE_KEY` to your key.
4. If the captcha modal shows a load error, read the message in the modal; it is separate from pressing Cancel.

<br />

Use the following template for new issues: 


## [Issue Title]

[Description of issue]


Steps to Resolve Issue: 
1. [Step 1]
2. [Step 2]
3. [Step 3]
4. [...]

