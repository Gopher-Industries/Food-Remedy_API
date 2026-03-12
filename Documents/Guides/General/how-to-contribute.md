# 🧑‍💻 How To Contribute

This guide explains how to contribute to the **Food Remedy** project using Microsoft Planner and GitHub.  
It includes how to claim a ticket, create a branch and submit your code.

<br/>


## 📚 Table of Contents

- [🔧 Prerequisites](#️-prerequisites)
- [🛠️ Working on Tickets](#-working-on-tickets)
- [📤 Finishing Your Ticket & Creating a Pull Request](#-finishing-your-ticket--creating-a-pull-request)
- [🧩 Handling Merge Conflicts](#️-handling-merge-conflicts)
- [🗂️ Finalising the Ticket](#-finalising-the-ticket)
- [🙌 Final Notes](#-final-notes)


<br />


## 🔧 Prerequisites

- Access to the [GitHub Repository](https://github.com/Gopher-Industries/foodremedy)  
- Access to the [Planner Board](https://tasks.office.com/deakin365.onmicrosoft.com/en-AU/Home/Planner/#/plantaskboard?groupId=b9325320-8dcf-4204-81c7-46ccdd3b0798&planId=-84UWjpguUKN44qYXOExBsgAFLTp)  
- [VSCode](https://code.visualstudio.com/)    
- A terminal with [Git](https://git-scm.com/) installed (Git Bash or VSCode Terminal)


<br/>


## 🛠️ Working on Tickets

### Cloning the Repository
Before working on your first ticket, make sure you've cloned the project repository to your local machine.  
Refer to the [project README](/README.md) for detailed instructions on how to clone the repository.


### Selecting a Ticket
- Navigate to the [Planner board](https://tasks.office.com/deakin365.onmicrosoft.com/en-AU/Home/Planner/#/plantaskboard?groupId=b9325320-8dcf-4204-81c7-46ccdd3b0798&planId=-84UWjpguUKN44qYXOExBsgAFLTp)
- Choose a ticket from the **Ready to Start** column. Use the ticket code and difficulty level to help determine whether the task matches your skill level.
- Click **Assign** to allocate the task to yourself
- Move the ticket to the **Underway (In Progress)** column

> 💡 Anyone can take on any level of ticket, but if you’re aiming for higher grades, make sure to tackle some Level 2 or 3 tickets.  
> 💡 If the ticket does **not involve coding**, you can skip the branching steps and proceed to [Completing Codefree Tickets](/Documents/completing-codefree-tickets.md)  


### Creating a Branch
Open the project in VSCode and launch a terminal in the root project directory (where you cloned the repo).  
Use the following commands to ensure you're starting from the latest main branch:

```bash
# Switch to main branch
git checkout main

# Pull the latest changes
git pull

# Create new branch. Ticket Code should match your ticket from microsoft planner.
git checkout -b TicketCode-TicketTitle
```

Example:
```bash
git checkout -b FE080-Create-Clients-Table
```

You are now ready to start coding. 
> ⚠️ Always ensure you’re working on the correct branch to avoid conflicts and ensure clean merges.


<br/>


## 📤 Finishing Your Ticket & Creating a Pull Request

### Commit & Push Changes
Once you’ve completed your ticket and tested your changes locally, commit and push your branch to GitHub: 

```bash
# Stage all changes
git add .

# Commit with a clear message and ticket reference
git commit -m "Short message about changes. See TICKETCODE"

# Push your branch
git push origin BRANCH-NAME
```

Example: 
```bash
git add .
git commit -m "Created Clients Table. See FE080"
git push origin FE080-Create-Clients-Table
```

<br />

### Create a Pull Request (PR)
You’re now ready to submit your pull request for review:  

- Go to the `foodremedy` repository on GitHub.   
- Click **New Pull Request**
- Set the **base** branch to `main`, and the **compare** branch to your branch  
- Add a clear title and description: 
  - Title: Start with ticket code (e.g. FE080 - Create Clients Table)  
  - Description: Keep it brief — usually 1–2 sentences summarising what was done.  
- Attach screenshots where necessary 


<br/>


## 🧩 Handling Merge Conflicts
After submitting your pull request, GitHub may notify you of merge conflicts.   
Try to resolve these yourself by following GitHub’s prompts. If you’re stuck, feel free to ask a lead for assistance.  


<br/>

## Reset To Main Branch
After you pushed the ticket, you now need to set your branch back to main so that you can start the process over again.
Run
- `git checkout main`
- `git pull`
Always create new tickets off the updated main branch

<br />

## 🗂️ Finalising the Ticket
Move the ticket to the **In Review (Pull Request Created)** column in Planner.  
If your reviewer requests changes, return to your branch, make the updates, and repeat the commit and push steps — the pull request will update automatically.  


Once the PR is merged:  
- The ticket is considered complete
- Drag the ticket to the Done column (unless the reviewer has already done so)
- Do not mark it as "Complete" — leads will confirm this during the weekly meeting.

> DO NOT change the "progress" in a ticket. Only move the ticket between buckets / columns.  
> Tickets that are marked as "completed" in the `Progress` status will not be counted.

<br/>


## 🙌 Final Notes
Well done on contributing to the Food Remedy project!  

Following this process ensures that our workflow remains consistent, our codebase stays clean, and everyone on the team can collaborate effectively. If you're ever unsure about something — whether it's creating a branch, resolving a merge conflict, or writing a pull request — don't hesitate to ask for help in the team chat.  
