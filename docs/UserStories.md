# User Stories — Expense Tracker

## Epic: Authentication

### US-001: User Registration
**Story:** As a new user, I want to create an account with my email so that I can securely access my expense data.

**Acceptance Criteria:**
- Registration form requires email, password, confirm password
- Email must be valid format
- Password must be ≥8 characters with 1 uppercase, 1 number
- Error messages explain validation failures clearly
- Success redirects to dashboard
- Duplicate email shows appropriate error

**Priority:** Must  
**Estimate:** 3 points

---

### US-002: User Login
**Story:** As a returning user, I want to log in with my email and password so that I can access my expense data.

**Acceptance Criteria:**
- Login form accepts email and password
- "Remember me" option (30-day session)
- Invalid credentials show generic message (security)
- Success redirects to dashboard
- Password field supports show/hide toggle

**Priority:** Must  
**Estimate:** 2 points

---

### US-003: User Logout
**Story:** As a logged-in user, I want to securely log out so that others can't access my data.

**Acceptance Criteria:**
- Logout button in navigation/profile
- Clears session/token
- Redirects to login page
- Cannot access protected routes after logout

**Priority:** Must  
**Estimate:** 1 point

---

## Epic: Expense Management

### US-004: Add Quick Expense
**Story:** As a user, I want to quickly log an expense so that I don't forget what I spent.

**Acceptance Criteria:**
- "Add Expense" button visible from any page
- Form fields: Amount, Description (optional), Category (dropdown), Date (default: today)
- Amount accepts decimal values (2 decimal places max)
- Category selection uses pre-filled dropdown
- Submit creates expense, shows success toast
- Form resets for rapid entry
- Quick-add accessible from dashboard

**Priority:** Must  
**Estimate:** 3 points

---

### US-005: View Expense History
**Story:** As a user, I want to see my past expenses in a list so that I can review my spending.

**Acceptance Criteria:**
- List shows: Date, Description, Category, Amount
- Sorted by date descending (newest first)
- Paginated at 50 items
- Category badges use category colors
- Empty state guides users to add first expense
- Click expense to view detail

**Priority:** Must  
**Estimate:** 3 points

---

### US-006: Edit Expense
**Story:** As a user, I want to edit an existing expense so that I can correct mistakes.

**Acceptance Criteria:**
- Edit option from expense list or detail view
- Pre-populated form with existing data
- Validation same as add expense
- Success message on save
- Cancel option returns without changes

**Priority:** Must  
**Estimate:** 2 points

---

### US-007: Delete Expense
**Story:** As a user, I want to delete an expense so that I can remove incorrect entries.

**Acceptance Criteria:**
- Delete option from expense list or detail view
- Confirmation dialog required
- Soft delete or hard delete with undo (decide in tech design)
- Success message on deletion
- List updates immediately

**Priority:** Must  
**Estimate:** 2 points

---

### US-008: Category Filtering
**Story:** As a user, I want to filter my expenses by category so that I can focus on specific spending areas.

**Acceptance Criteria:**
- Category filter dropdown with "All" option
- Filter updates list in real-time
- URL reflects current filter (shareable/bookmarkable)
- Clear filter option resets to all
- Works with pagination

**Priority:** Must  
**Estimate:** 2 points

---

### US-009: Date Range Filtering
**Story:** As a user, I want to filter expenses by date range so that I can review specific time periods.

**Acceptance Criteria:**
- Start and end date pickers
- Preset options (Last 7 days, This month, Last month, Custom)
- Clear range option
- Updates list in real-time
- URL reflects filter

**Priority:** Should  
**Estimate:** 3 points

---

## Epic: Categories

### US-010: Use Predefined Categories
**Story:** As a user, I want to choose from standard expense categories so that I can classify my spending quickly.

**Acceptance Criteria:**
- 8 categories available: Food, Transport, Utilities, Entertainment, Shopping, Health, Travel, Other
- Each category has color and optional icon
- Categories consistent across UI
- Category displayed in expense list with visual indicator

**Priority:** Must  
**Estimate:** 2 points

---

### US-011: Create Custom Categories
**Story:** As a user, I want to create my own categories so that I can organize my spending my way.

**Acceptance Criteria:**
- "Add Category" option in settings
- Name input required
- Color picker for category
- Cannot duplicate existing category names
- New category available immediately in dropdown

**Priority:** Should  
**Estimate:** 3 points

---

## Epic: Budgeting

### US-012: Set Monthly Budget
**Story:** As a user, I want to set a monthly spending limit so that I can control my spending.

**Acceptance Criteria:**
- Budget input accepts numeric value
- Budget persists month-to-month
- Can edit budget at any time
- Budget applies to current calendar month
- Saved in user settings

**Priority:** Must  
**Estimate:** 2 points

---

### US-013: View Budget Progress
**Story:** As a user, I want to see how much of my budget I've used so that I can adjust my spending.

**Acceptance Criteria:**
- Visual progress bar showing % used
- Color coding: green (<70%), yellow (70-90%), red (>90%)
- Shows spent / total format
- Updates in real-time when expenses added/deleted
- Visible on dashboard

**Priority:** Must  
**Estimate:** 2 points

---

### US-014: Budget Alert
**Story:** As a user, I want to be notified when I'm approaching my budget limit so that I can avoid overspending.

**Acceptance Criteria:**
- Alert triggered at 80% of budget
- Visual indicator (banner or badge)
- Alert dismissible but reappears on refresh if still >80%
- Clear messaging about remaining budget

**Priority:** Should  
**Estimate:** 2 points

---

## Epic: Dashboard

### US-015: Dashboard Overview
**Story:** As a user, I want to see a summary of my spending so that I can quickly understand my financial status.

**Acceptance Criteria:**
- Dashboard is default landing page
- Shows total spent this month (large number)
- Shows remaining budget with progress bar
- Shows category breakdown (pie or bar chart)
- Shows last 5 transactions
- Data updates automatically on load

**Priority:** Must  
**Estimate:** 5 points

---

### US-016: Monthly Comparison
**Story:** As a user, I want to compare this month's spending to last month so that I can track my progress.

**Acceptance Criteria:**
- Comparison indicator (↑↓) with percentage
- Shows last month's total
- Quick insight on trend
- Optional: brief explanation text

**Priority:** Should  
**Estimate:** 3 points

---

## Epic: User Experience

### US-017: Responsive Design
**Story:** As a mobile user, I want the app to work well on my phone so that I can track expenses on the go.

**Acceptance Criteria:**
- Works on viewport widths 320px - 1920px+
- Touch targets minimum 44px
- No horizontal scrolling
- Optimized layout for mobile
- Fast load on mobile networks

**Priority:** Must  
**Estimate:** 5 points

---

### US-018: Quick Entry from Mobile
**Story:** As a mobile user, I want to add expenses quickly so that I can log spending immediately after purchase.

**Acceptance Criteria:**
- "+" button always accessible
- Large, easy-to-tap inputs
- Number pad for amount
- Save within 10 seconds possible
- Offline indicator (if offline)

**Priority:** Must  
**Estimate:** 3 points

---

## Summary Table

| ID | Story | Epic | Priority | Points |
|----|-------|------|----------|--------|
| US-001 | User Registration | Auth | Must | 3 |
| US-002 | User Login | Auth | Must | 2 |
| US-003 | User Logout | Auth | Must | 1 |
| US-004 | Add Quick Expense | Expenses | Must | 3 |
| US-005 | View Expense History | Expenses | Must | 3 |
| US-006 | Edit Expense | Expenses | Must | 2 |
| US-007 | Delete Expense | Expenses | Must | 2 |
| US-008 | Category Filtering | Expenses | Must | 2 |
| US-009 | Date Range Filtering | Expenses | Should | 3 |
| US-010 | Predefined Categories | Categories | Must | 2 |
| US-011 | Custom Categories | Categories | Should | 3 |
| US-012 | Set Monthly Budget | Budgeting | Must | 2 |
| US-013 | View Budget Progress | Budgeting | Must | 2 |
| US-014 | Budget Alert | Budgeting | Should | 2 |
| US-015 | Dashboard Overview | Dashboard | Must | 5 |
| US-016 | Monthly Comparison | Dashboard | Should | 3 |
| US-017 | Responsive Design | UX | Must | 5 |
| US-018 | Quick Entry Mobile | UX | Must | 3 |

**Total:** 18 stories  
**Must Points:** 35  
**Should Points:** 14
