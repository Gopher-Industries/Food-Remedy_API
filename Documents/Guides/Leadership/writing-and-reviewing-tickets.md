# 🧾 Writing and Reviewing Tickets

This guide explains how to properly write tickets in Microsoft Planner and how to review submitted work through GitHub pull requests. It ensures all tasks follow a consistent structure and can be tracked, claimed, and reviewed smoothly.  


<br/>


## 📚 Table of Contents

- [🔧 Prerequisites](#-prerequisites)
- [🏷️ Ticket Codes & Difficulty Levels](#️-ticket-codes--difficulty-levels)
- [✍️ Creating Tickets](#️-creating-tickets)
- [🧪 Reviewing Tickets](#-reviewing-tickets)


<br/>


## 🔧 Prerequisites

- Access to the [GitHub Repository](https://github.com/Gopher-Industries/foodremedy)  
- Access to the [Planner Board](https://planner.cloud.microsoft/webui/v1/plan/UUQU08NFekam1upwjTc9R8gABouq?tid=d02378ec-1688-46d5-8540-1c28b5f470f6)  
- [VSCode](https://code.visualstudio.com/) (with GitLens extension recommended)  
- A terminal with [Git](https://git-scm.com/) installed (Git Bash or VSCode Terminal)


<br/>


## 🏷️ Ticket Codes & Difficulty Levels

All tickets in Planner must follow a consistent structure — including a unique code and difficulty label — to ensure clear tracking across branches, commits, and pull requests.  

See the [Ticket Structure](/Documents/ticket-structure.md) guide for full details on naming conventions, prefixes, difficulty levels, and examples.  

> Use a two-letter prefix (e.g. `FE`, `BE`, `DB`) followed by a unique number (e.g. `FE080`).  
> Apply a difficulty label from Level 1 (basic) to Level 3 (advanced) depending on the complexity of the task.


<br/>


## ✍️ Creating Tickets

Leads will create most of the tickets, but **any contributor** can add a ticket if needed — just check with the lead for your section to avoid duplication or conflict.


### Steps to Create a Ticket

1. **Ensure Relevance**  
   Make sure the task aligns with the project’s trimester goals and scope.

2. **Add a New Task**  
   In Planner, click **Add Task** at the top of the **Ready to Start** column.

3. **Name the Ticket**  
   Use a meaningful title that describes the task and includes a ticket code (based on labels and existing count).  
   > ⚠️ If multiple tickets are added quickly, codes may duplicate. Adjust the number manually if needed.

4. **Apply Labels**  
   Add:
   - The **area** (e.g., FE, BE, DB)
   - The **difficulty level** (Level 1, 2, or 3)  
   > Code-free tickets should always be marked **Level 1**, as they don’t count toward technical contributions for grading.

1. **Write a Clear Description**  
   - **Level 1**: Include step-by-step instructions  
   - **Level 2–3**: Include a short user story or objective, plus implementation notes  
   > The more detail you provide, the less time others spend trying to interpret the task

2. **Move the Ticket**  
   - If the ticket isn’t ready (e.g. needs input or blocking tasks), move it to **Backlog**  
   - Otherwise, leave it in **Ready to Start** or assign it to yourself and move it to **Underway**


<br/>


## 🧪 Reviewing Tickets

All pull requests must be **reviewed and approved** by a lead before merging. Even leads should have their tickets reviewed by another lead.

### Steps to Review a Ticket

1. **Confirm the PR is Ready**  
   Ensure the pull request is not a draft or an incomplete branch.

2. **Read the PR & Ticket**  
   Check the description in the PR and verify it matches the Planner ticket’s requirements. Ask the ticket creator for clarification if needed.

3. **Check Out the Branch**
   ```bash
   git fetch -a
   git checkout <branch-name>
   ```

4. Run Tests & Manual Check
   Test the feature and try edge cases to confirm everything behaves as expected.
   ```bash
   dotnet test api
   python run.py
   ```

5. **Review the Code**
   - Open the **Files Changed** tab in the GitHub pull request.
   - Leave feedback using the ➕ button next to the line of code.
   - To comment on multiple lines, click and drag from the ➕ icon to highlight the block.

6. **Check for Quality and Clean History**
   - Ensure all ticket requirements are implemented and working.
   - Confirm there are no unrelated files, unused code, or debug remnants.
   - Watch for duplicated commits already merged into `main`. If found, resolve by cherry-picking the required commits into a new clean branch.

7. **Submit the Review**
   - Click **Review Changes** and choose either:
     - **Approve**
     - **Request Changes** — Be specific and respectful.
   - Revisit the PR regularly to check for updates. If progress stalls, reach out and offer assistance.

8. **Handle Merge Conflicts (if needed)**
   - If GitHub shows merge conflicts, help the contributor **rebase** onto `main`.
   - Always **re-test** the feature after rebasing, as it can introduce new issues.

9. **Squash and Merge**
   - Once approved and conflict-free, select **Squash and Merge** to keep a clean commit history.

10. **Update Planner**
   - Move the ticket to the **Done** column in Microsoft Planner.  
   - Leave the final **Complete** status for leads to apply during the weekly review meeting.  
