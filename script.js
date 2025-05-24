// Core calculation logic will be translated here

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('calculator-form');
    const extraPaymentTypeRadios = document.querySelectorAll('input[name="extra_payment_type"]');
    const reducePaymentRadio = document.getElementById('reduce_payment');
    const reduceTermRadio = document.getElementById('reduce_term');
    const nMonthsInputGroup = document.getElementById('n_months_input_group');
    const flashMessagesDiv = document.getElementById('flash-messages');
    const resultsSection = document.getElementById('results-section');
    
    // Set default values
    document.getElementById('balance').value = '1 000 000';
    document.getElementById('rate').value = '20';
    document.getElementById('term_value').value = '10';
    document.getElementById('term_unit').value = 'years';
    document.getElementById('extra_payment_amount').value = '10 000';
    document.getElementById('one-time').checked = true;
    document.getElementById('reduce_term').checked = true;
    
    // Chart variables
    let loanChart = null;
    let originalScheduleData = [];
    let newScheduleData = [];
    let savedScenarios = [];
    const MAX_SAVED_SCENARIOS = 3;

    // Element references for scenario comparison
    const saveScenarioButton = document.getElementById('save-scenario-button');
    const comparisonSection = document.getElementById('comparison-section');
    const savedScenariosContainer = document.getElementById('saved-scenarios-container');
    const scenarioCountDisplay = document.getElementById('scenario-count-display');
    const savedScenariosList = document.getElementById('saved-scenarios-list');
    const comparisonDisplayArea = document.getElementById('comparison-display-area');
    const currentScenarioComparisonDetails = document.querySelector('#current-scenario-comparison .comparison-details');
    const savedScenarioComparisonDetails = document.querySelector('#saved-scenario-comparison .comparison-details');

    // Slider elements
    const extraPaymentAmountSlider = document.getElementById('extra_payment_amount_slider');
    const extraPaymentAmountSliderValueDisplay = document.getElementById('extra_payment_amount_slider_value');

    // Print/Export elements
    const resultsActionsDiv = document.querySelector('.results-actions');
    const printResultsButton = document.getElementById('print-results-button');
    const exportCsvButton = document.getElementById('export-csv-button');


    function updateFormVisibility() {
        const selectedType = document.querySelector('input[name="extra_payment_type"]:checked').value;

        // Manage 'N months' input visibility
        if (selectedType === 'recurring_n_months') {
            nMonthsInputGroup.style.display = 'block';
        } else {
            nMonthsInputGroup.style.display = 'none';
        }

        // Manage 'Goal' options
        const reducePaymentLabel = reducePaymentRadio.parentElement;
        if (selectedType === 'recurring') { // Standard recurring always reduces term
            reducePaymentRadio.disabled = true;
            reducePaymentRadio.checked = false;
            reduceTermRadio.checked = true;
            reducePaymentLabel.classList.add('disabled');
        } else { // For 'one-time' and 'recurring_n_months', both goals are typically valid
            reducePaymentRadio.disabled = false;
            reducePaymentLabel.classList.remove('disabled');
        }
    }

    extraPaymentTypeRadios.forEach(radio => {
        radio.addEventListener('change', updateFormVisibility);
    });

    form.addEventListener('submit', function(event) {
        event.preventDefault();
        clearFlashMessages();
        calculateAndDisplayResults();
    });

    // Initial visibility update
    updateFormVisibility();

    // Function to format number inputs with spaces as thousands separators
    function formatNumericInput(event) {
        const input = event.target;
        let value = input.value;
        let cursorPos = input.selectionStart;

        // Count significant chars (digits, one dot) before original cursor
        // This helps restore cursor position correctly after reformatting
        let significantCharsCount = 0;
        let firstDotFound = false;
        for(let i = 0; i < cursorPos; i++) {
            if (value[i] >= '0' && value[i] <= '9') {
                significantCharsCount++;
            } else if (value[i] === '.' && !firstDotFound) {
                significantCharsCount++;
                firstDotFound = true;
            }
        }

        // Sanitize: keep digits and ONE decimal point. Limit decimals to 2 places.
        let V = value.replace(/[^\d.]/g, ""); 
        let parts = V.split('.');
        let integerPart = parts[0];
        let decimalPart = parts.length > 1 ? '.' + parts[1].substring(0, 2) : '';
        
        if (integerPart === "" && decimalPart === ".") { 
          integerPart = "0"; 
        } else if (integerPart === "" && decimalPart.length > 0 && decimalPart !== '.') { 
          integerPart = "0"; 
        }
        if (integerPart.length > 1 && integerPart.startsWith('0') && !integerPart.startsWith('0.')) {
            integerPart = integerPart.replace(/^0+/, ''); // Remove leading zeros unless it's just '0'
            if (integerPart === '') integerPart = '0';
        }


        // Format integer part with spaces
        let formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        let formattedValue = formattedInteger + decimalPart;

        input.value = formattedValue;

        // Calculate new cursor position
        let newCursorPos = 0;
        let scFound = 0; // Significant characters found in new formatted value
        firstDotFound = false; // Reset for counting in formattedValue
        for (let i = 0; i < formattedValue.length; i++) {
            if (formattedValue[i] >= '0' && formattedValue[i] <= '9') {
                scFound++;
            } else if (formattedValue[i] === '.' && !firstDotFound) {
                scFound++;
                firstDotFound = true;
            }
            if (scFound === significantCharsCount) {
                newCursorPos = i + 1;
                break;
            }
        }
        if (significantCharsCount === 0) {
            newCursorPos = 0;
        } else if (scFound < significantCharsCount) { // If all significant chars were not found (e.g. deleted last char)
            newCursorPos = formattedValue.length;
        }

        input.setSelectionRange(newCursorPos, newCursorPos);
    }

    const balanceInput = document.getElementById('balance');
    if (balanceInput) {
        balanceInput.addEventListener('input', formatNumericInput);
    }
    const extraPaymentAmountInput = document.getElementById('extra_payment_amount');
    if (extraPaymentAmountInput) {
        extraPaymentAmountInput.addEventListener('input', formatNumericInput);
    }


    function displayFlashMessage(message, category) {
        const flashDiv = document.createElement('div');
        flashDiv.className = `flash ${category}`;
        flashDiv.textContent = message;
        flashMessagesDiv.appendChild(flashDiv);
        flashMessagesDiv.style.display = 'block';
    }

    function clearFlashMessages() {
        flashMessagesDiv.innerHTML = '';
        flashMessagesDiv.style.display = 'none';
    }

    function formatCurrency(value) {
        if (value === null || typeof value === 'string' || value === Infinity || isNaN(value)) {
            return value; 
        }
        try {
            let formattedValue = parseFloat(value).toFixed(2);
            // Add spaces for thousands separators - Russian style
            formattedValue = formattedValue.replace(/\B(?=(\d{3})+(?!\d))/g, " "); 
            return `${formattedValue} руб.`;
        } catch (e) {
            return String(value); 
        }
    }

    function formatTerm(months) {
        if (months === Infinity || isNaN(months) || months < 0) return "не погашается";
        if (months === 0) return "0 мес. (погашен)";
        const years = Math.floor(months / 12);
        const remainingMonths = Math.ceil(months % 12);
        let termString = "";
        if (years > 0) {
            termString += `${years} г. `;
        }
        if (remainingMonths > 0) {
            termString += `${remainingMonths} мес.`;
        }
        return termString.trim() || "0 мес.";
    }

    function _calculateMonthlyPayment(P, monthly_r, n_months) {
        if (P <= 0) return 0;
        if (n_months <= 0) return Infinity; // Cannot pay off in 0 or less months unless P is 0
        if (monthly_r === 0) {
            return P / n_months;
        }
        try {
            const payment = P * (monthly_r * Math.pow(1 + monthly_r, n_months)) / (Math.pow(1 + monthly_r, n_months) - 1);
            return payment;
        } catch (OverflowError) {
            return Infinity;
        }
    }

    function _calculateTermMonths(P, M, monthly_r) {
        if (P <= 0) return 0;
        if (M <= 0) return Infinity; 
        if (monthly_r === 0) {
            return P / M;
        }
        if (M <= P * monthly_r) { // Payment doesn't even cover interest
            return Infinity; 
        }
        try {
            const term = -Math.log(1 - (P * monthly_r) / M) / Math.log(1 + monthly_r);
            return term;
        } catch (e) { // ValueError for log of non-positive
            return Infinity;
        }
    }

    function calculateAndDisplayResults() {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        const P_current_str = String(data.balance || '0').replace(/ /g, ''); // Remove spaces, handle empty
        const P_current = parseFloat(P_current_str);
        const annual_rate_percent = parseFloat(data.rate);
        const N_remaining_val = parseFloat(data.term_value);
        const term_unit = data.term_unit;
        const E_extra_str = String(data.extra_payment_amount || '0').replace(/ /g, ''); // Remove spaces, handle empty
        const E_extra = parseFloat(E_extra_str);
        const M_current_known_str = data.current_payment;
        
        const extra_payment_type = data.extra_payment_type;
        const goal = data.goal;
        let n_months_for_recurring = 0;
        if (extra_payment_type === 'recurring_n_months') {
            n_months_for_recurring = parseInt(data.n_months_recurring_count, 10);
            if (isNaN(n_months_for_recurring) || n_months_for_recurring <= 0) {
                displayFlashMessage("Количество месяцев для досрочного погашения должно быть больше нуля.", "error");
                return;
            }
        }

        if (P_current <= 0 || annual_rate_percent < 0 || N_remaining_val <= 0 || E_extra < 0) {
            displayFlashMessage("Суммы, ставка и срок должны быть положительными. Сумма досрочного платежа не может быть отрицательной.", "error");
            return;
        }

        const monthly_r = (annual_rate_percent / 100) / 12;
        const N_months_original = term_unit === "years" ? Math.round(N_remaining_val * 12) : Math.round(N_remaining_val);

        let M_baseline = 0;
        let original_calculated_payment_str = "-";
        if (M_current_known_str && !isNaN(parseFloat(M_current_known_str))) {
            M_baseline = parseFloat(M_current_known_str);
            if (M_baseline <= 0) {
                displayFlashMessage("Текущий ежемесячный платеж должен быть положительным. Он будет рассчитан.", "warning");
                M_baseline = _calculateMonthlyPayment(P_current, monthly_r, N_months_original);
                original_calculated_payment_str = formatCurrency(M_baseline);
            }
        } else {
            M_baseline = _calculateMonthlyPayment(P_current, monthly_r, N_months_original);
            if (M_baseline !== Infinity && M_baseline > 0) {
                 original_calculated_payment_str = formatCurrency(M_baseline);
            } else {
                 original_calculated_payment_str = "Не удалось рассчитать";
            }
        }

        if (M_baseline === Infinity || (monthly_r > 0 && M_baseline <= P_current * monthly_r && N_months_original > 0 && M_baseline > 0)) {
            displayFlashMessage("Платеж слишком мал для покрытия процентов или срок слишком велик. Проверьте ставку и срок.", "error");
            return;
        }
        if (M_baseline === 0 && P_current > 0) {
            displayFlashMessage("Не удалось рассчитать исходный платеж. Проверьте параметры кредита.", "error");
            return;
        }

        const Total_Paid_Old = M_baseline * N_months_original;
        const Total_Interest_Old = P_current > 0 ? Math.max(0, Total_Paid_Old - P_current) : 0;
        
        let P_after_payment = P_current;
        let N_new_months_calc = N_months_original;
        let M_new_scheduled = M_baseline;
        let Total_Paid_New = 0;
        let P_remaining_after_N = P_current;
        let actual_n_months_paid = 0;

        if (extra_payment_type === "one-time" && E_extra >= P_current) {
            Total_Paid_New = P_current; // Amount paid towards principal
            if (E_extra > P_current) Total_Paid_New = P_current; // If you pay more than loan, you only paid off the loan amount
            N_new_months_calc = 0;
            M_new_scheduled = 0;
        } else if (extra_payment_type === "one-time") {
            P_after_payment = P_current - E_extra;
            if (P_after_payment < 0) P_after_payment = 0;
            
            if (goal === "reduce_term") {
                M_new_scheduled = M_baseline;
                if (P_after_payment === 0) {
                    N_new_months_calc = 0;
                } else {
                    N_new_months_calc = _calculateTermMonths(P_after_payment, M_new_scheduled, monthly_r);
                }
                if (N_new_months_calc === Infinity) {
                    displayFlashMessage("Не удалось рассчитать новый срок. Возможно, платеж слишком мал для нового остатка.", "error");
                    return;
                }
            } else if (goal === "reduce_payment") {
                N_new_months_calc = N_months_original; 
                if (P_after_payment === 0) {
                    M_new_scheduled = 0;
                } else {
                    M_new_scheduled = _calculateMonthlyPayment(P_after_payment, monthly_r, N_new_months_calc);
                }
                if (M_new_scheduled === Infinity) {
                    displayFlashMessage("Не удалось рассчитать новый платеж.", "error");
                    return;
                }
            }
            Total_Paid_New = (M_new_scheduled * Math.ceil(N_new_months_calc === Infinity ? 0 : N_new_months_calc)) + E_extra;
        
        } else if (extra_payment_type === "recurring") {
            const M_effective = M_baseline + E_extra;
            M_new_scheduled = M_baseline; // Bank scheduled payment remains, you just overpay
            N_new_months_calc = _calculateTermMonths(P_current, M_effective, monthly_r);
            if (N_new_months_calc === Infinity) {
                displayFlashMessage("Не удалось рассчитать новый срок с учетом доп. ежемесячного платежа.", "error");
                return;
            }
            Total_Paid_New = M_effective * Math.ceil(N_new_months_calc === Infinity ? 0 : N_new_months_calc);
        
        } else if (extra_payment_type === "recurring_n_months") {
            P_remaining_after_N = P_current;
            let Total_Paid_During_N_Period = 0;
            const M_effective_N = M_baseline + E_extra;

            if (M_effective_N <= P_remaining_after_N * monthly_r && monthly_r > 0 && P_remaining_after_N > 0) {
                displayFlashMessage(`Платеж ${formatCurrency(M_effective_N)} недостаточен для покрытия процентов в период N платежей.`, "error");
                return;
            }
            actual_n_months_paid = 0;
            for (let i = 0; i < n_months_for_recurring; i++) {
                if (P_remaining_after_N <= 0.01) break;
                actual_n_months_paid++;
                const interest_payment = P_remaining_after_N * monthly_r;
                const principal_payment = M_effective_N - interest_payment;
                P_remaining_after_N -= principal_payment;
                Total_Paid_During_N_Period += M_effective_N;
                if (P_remaining_after_N < 0.01) {
                    Total_Paid_During_N_Period += P_remaining_after_N; // Adjust for overpayment
                    P_remaining_after_N = 0;
                    break;
                }
            }
            
            Total_Paid_New = Total_Paid_During_N_Period;
            
            if (P_remaining_after_N <= 0) { 
                M_new_scheduled = 0; 
                N_new_months_calc = 0; 
            } else {
                if (goal === "reduce_term") {
                    M_new_scheduled = M_baseline; 
                    let N_after_N_period = _calculateTermMonths(P_remaining_after_N, M_new_scheduled, monthly_r);
                    if (N_after_N_period === Infinity) {
                        displayFlashMessage(`После ${actual_n_months_paid} мес. досрочных платежей, остаток ${formatCurrency(P_remaining_after_N)} не может быть погашен стандартным платежом ${formatCurrency(M_baseline)}.`, "warning");
                        M_new_scheduled = 0; 
                        N_new_months_calc = Infinity; 
                    } else {
                        N_new_months_calc = N_after_N_period;
                        Total_Paid_New += M_new_scheduled * Math.ceil(N_new_months_calc === Infinity ? 0 : N_new_months_calc);
                    }
                } else if (goal === "reduce_payment") {
                    let N_remaining_original_schedule = Math.max(0, N_months_original - actual_n_months_paid);
                    if (N_remaining_original_schedule === 0 && P_remaining_after_N > 0) {
                        N_remaining_original_schedule = 1; // If term ended but balance remains, pay in 1 more month
                    } 

                    if (P_remaining_after_N <= 0) {
                         M_new_scheduled = 0;
                         N_new_months_calc = 0;
                    } else if (N_remaining_original_schedule === 0 && P_remaining_after_N > 0){
                        M_new_scheduled = P_remaining_after_N * (1 + monthly_r); // Pay off in one month with interest
                        N_new_months_calc = 1;
                    } else {
                        M_new_scheduled = _calculateMonthlyPayment(P_remaining_after_N, monthly_r, N_remaining_original_schedule);
                        N_new_months_calc = N_remaining_original_schedule;
                    }
                    
                    if (M_new_scheduled === Infinity) {
                        displayFlashMessage(`Не удалось рассчитать новый платеж после ${actual_n_months_paid} мес. досрочных взносов.`, "error");
                        M_new_scheduled = 0;
                        N_new_months_calc = Infinity;
                    } else if (P_remaining_after_N > 0) {
                         Total_Paid_New += M_new_scheduled * Math.ceil(N_new_months_calc === Infinity ? 0 : N_new_months_calc);
                    }
                }
            }
        }

        const Total_Interest_New = P_current > 0 ? Math.max(0, Total_Paid_New - P_current) : 0;
        const Interest_Saved = Math.max(0, Total_Interest_Old - Total_Interest_New);

        // Display results
        resultsSection.style.display = 'block';
        document.getElementById('result-original-calculated-payment').textContent = original_calculated_payment_str;
        document.getElementById('result-new-monthly-payment').textContent = formatCurrency(M_new_scheduled);
        
        let term_display_val = N_new_months_calc;
        if (extra_payment_type === "recurring_n_months") {
            // For recurring_n_months, N_new_months_calc is the term *after* the N payments.
            // The total term is actual_n_months_paid + N_new_months_calc (if N_new_months_calc is not Infinity and loan not paid off in N)
            if (P_remaining_after_N > 0 && N_new_months_calc !== Infinity) {
                 term_display_val = actual_n_months_paid + N_new_months_calc;
            } else if (P_remaining_after_N <= 0) { // Paid off within N months
                 term_display_val = actual_n_months_paid;
            } else { // Not paid off after N, and calculation for after N failed
                 term_display_val = Infinity; // Or show something like 'N + не погашается'
            }
        }
        const resultNewTermEl = document.getElementById('result-new-term');
        resultNewTermEl.textContent = formatTerm(term_display_val);
        resultNewTermEl._rawMonths = term_display_val; // Store raw months for scenario comparison

        document.getElementById('result-old-total-interest').textContent = formatCurrency(Total_Interest_Old);
        document.getElementById('result-new-total-interest').textContent = formatCurrency(Total_Interest_New);
        document.getElementById('result-interest-saved').textContent = formatCurrency(Interest_Saved);

        // Create or update the pie chart
        updateLoanChart(P_current, Total_Interest_New);
        
        // Make sure the results section is visible
        document.getElementById('results-section').style.display = 'block';

        if (Interest_Saved > 0) {
            displayFlashMessage(`Отлично! Вы сэкономите ${formatCurrency(Interest_Saved)} на процентах.`, 'success');
        } else if (Total_Interest_New < Total_Interest_Old && E_extra > 0) { // Check if an extra payment was made
             displayFlashMessage('Параметры кредита обновлены с учетом досрочного погашения.', 'success');
        } else if (P_current > 0 && M_new_scheduled === 0 && N_new_months_calc === 0 && E_extra >= P_current) {
            displayFlashMessage('Кредит будет полностью погашен досрочным платежом!', 'success');
        } else if (E_extra === 0) {
            // No message needed if only baseline calculation is done
        }


        // --- Amortization Schedule Generation ---
        originalScheduleData = [];
        newScheduleData = [];

        // Generate Original Schedule
        if (M_baseline > 0 && N_months_original > 0 && N_months_original !== Infinity) {
            originalScheduleData = generateAmortizationSchedule(P_current, monthly_r, M_baseline, Math.ceil(N_months_original));
        }

        // Generate New Schedule
        if (E_extra > 0 || extra_payment_type === "one-time") { // Only generate if there's an actual change
            if (extra_payment_type === "one-time") {
                if (E_extra >= P_current) { // Loan paid off
                    newScheduleData = [{ month: 1, payment: E_extra, principal: P_current, interest: 0, balance: 0 }];
                } else {
                    let termForNewSchedule_one_time = N_new_months_calc;
                     // For reduce_payment, N_new_months_calc is already N_months_original.
                     // If P_after_payment is 0, term is 0.
                    if (P_after_payment <= 0.01) termForNewSchedule_one_time = 0;

                    if (M_new_scheduled > 0 && termForNewSchedule_one_time > 0) {
                         newScheduleData = generateAmortizationSchedule(P_after_payment, monthly_r, M_new_scheduled, Math.ceil(termForNewSchedule_one_time));
                    } else if (P_after_payment <= 0.01) {
                         newScheduleData = []; // Already paid by E_extra
                    }
                }
            } else if (extra_payment_type === "recurring") {
                const M_effective_recurring = M_baseline + E_extra;
                if (M_effective_recurring > 0 && N_new_months_calc > 0 && N_new_months_calc !== Infinity) {
                    newScheduleData = generateAmortizationSchedule(P_current, monthly_r, M_effective_recurring, Math.ceil(N_new_months_calc));
                }
            } else if (extra_payment_type === "recurring_n_months") {
                const M_effective_N_schedule = M_baseline + E_extra;
                let part1Schedule = [];
                if (M_effective_N_schedule > 0 && actual_n_months_paid > 0) {
                    part1Schedule = generateAmortizationSchedule(P_current, monthly_r, M_effective_N_schedule, actual_n_months_paid);
                }
                
                let part2Schedule = [];
                if (P_remaining_after_N > 0.01) {
                    // N_new_months_calc here is the term *after* the N payments
                    let term_after_n_calc = N_new_months_calc;
                    if (goal === "reduce_payment") {
                        // N_new_months_calc is already set to N_remaining_original_schedule in the main logic
                    }

                    if (M_new_scheduled > 0 && term_after_n_calc > 0 && term_after_n_calc !== Infinity) {
                         part2Schedule = generateAmortizationSchedule(P_remaining_after_N, monthly_r, M_new_scheduled, Math.ceil(term_after_n_calc), actual_n_months_paid);
                    } else if (M_new_scheduled === 0 && P_remaining_after_N <= 0.01) { // Paid off
                        part2Schedule = [];
                    }
                }
                newScheduleData = part1Schedule.concat(part2Schedule);
            }
        }

        // --- End Amortization Schedule Generation ---

        // --- Render Schedules to UI ---
        renderSchedule('original-schedule-table', originalScheduleData);
        renderSchedule('new-schedule-table', newScheduleData);
        
        const amortizationSection = document.getElementById('amortization-schedules');
        if (originalScheduleData.length > 0 || newScheduleData.length > 0) {
            amortizationSection.style.display = 'block';
            // Ensure the default tab ('original') is shown if it has data, or 'new' if original is empty but new is not.
            if (originalScheduleData.length > 0) {
                showSchedule('original', document.querySelector('.tab-button[onclick*="original"]'));
            } else if (newScheduleData.length > 0) {
                showSchedule('new', document.querySelector('.tab-button[onclick*="new"]'));
            } else { // Both empty, hide section
                 amortizationSection.style.display = 'none';
            }
        } else {
            amortizationSection.style.display = 'none';
        }
        // --- End Render Schedules to UI ---

        if (P_current > 0 && M_baseline > 0 && M_baseline !== Infinity) { // Valid calculation was made
            saveScenarioButton.style.display = 'block';
            if(resultsActionsDiv) resultsActionsDiv.style.display = 'flex'; // Show print/export buttons
        } else {
            saveScenarioButton.style.display = 'none';
            if(resultsActionsDiv) resultsActionsDiv.style.display = 'none'; // Hide print/export buttons
        }
    }

    function printResults() {
        window.print();
    }

    function exportSchedulesToCSV() {
        let csvContent = "ScheduleType,Month,Payment,Principal,Interest,Balance\n";

        const formatRow = (scheduleType, row) => {
            // For CSV, use raw numbers, typically with dot as decimal separator.
            // Replace any potential commas from formatted numbers if they exist.
            const payment = String(row.payment).replace(/ /g, '').replace(/,/g, '.');
            const principal = String(row.principal).replace(/ /g, '').replace(/,/g, '.');
            const interest = String(row.interest).replace(/ /g, '').replace(/,/g, '.');
            const balance = String(row.balance).replace(/ /g, '').replace(/,/g, '.');
            return [
                scheduleType,
                row.month,
                parseFloat(payment).toFixed(2),
                parseFloat(principal).toFixed(2),
                parseFloat(interest).toFixed(2),
                parseFloat(balance).toFixed(2)
            ].join(",");
        };

        originalScheduleData.forEach(row => {
            csvContent += formatRow("Original", row) + "\n";
        });

        if (newScheduleData && newScheduleData.length > 0) {
            newScheduleData.forEach(row => {
                csvContent += formatRow("New", row) + "\n";
            });
        } else if (originalScheduleData.length > 0 && E_extra == 0) { 
            // If no extra payment, newScheduleData might be empty.
            // Optionally, indicate that the "New" schedule is same as "Original" if no changes made.
            // For now, just export what's calculated.
        }


        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) { // feature detection
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "loan_schedules.csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            displayFlashMessage("Экспорт CSV не поддерживается вашим браузером.", "error");
        }
    }


    if (printResultsButton) {
        printResultsButton.addEventListener('click', printResults);
    }
    if (exportCsvButton) {
        exportCsvButton.addEventListener('click', exportSchedulesToCSV);
    }


    function getCurrentScenarioDetails() {
        const formElement = document.getElementById('calculator-form');
        const formData = new FormData(formElement);
        const data = Object.fromEntries(formData.entries());

        // Helper to get text content from result elements
        const getResultText = (id) => document.getElementById(id) ? document.getElementById(id).textContent : '-';

        return {
            // Inputs
            balance: parseFloat(String(data.balance || '0').replace(/ /g, '')),
            rate: parseFloat(data.rate),
            termValue: parseFloat(data.term_value),
            termUnit: data.term_unit,
            extraPaymentAmount: parseFloat(String(data.extra_payment_amount || '0').replace(/ /g, '')),
            extraPaymentType: data.extra_payment_type,
            nMonthsRecurringCount: data.extra_payment_type === 'recurring_n_months' ? parseInt(data.n_months_recurring_count, 10) : null,
            goal: data.goal,
            // Key Results (fetch from display as they are already formatted or calculated)
            newMonthlyPayment: getResultText('result-new-monthly-payment'),
            newTerm: getResultText('result-new-term'),
            newTotalInterest: getResultText('result-new-total-interest'),
            interestSaved: getResultText('result-interest-saved'),
            originalCalculatedPayment: getResultText('result-original-calculated-payment'),
            // Store raw values for direct comparison if needed, or rely on formatted strings
            rawInterestSaved: parseFloat(getResultText('result-interest-saved').replace(/[^\d.-]/g, '')) || 0,
            rawNewTotalInterest: parseFloat(getResultText('result-new-total-interest').replace(/[^\d.-]/g, '')) || 0,
            rawNewTermMonths: document.getElementById('result-new-term')._rawMonths || null // Assuming we store raw months on element
        };
    }


    function saveScenario() {
        const currentScenario = getCurrentScenarioDetails();
        
        // Add a descriptive title
        currentScenario.title = `Кредит ${formatCurrency(currentScenario.balance)} @ ${currentScenario.rate}%`;
        if (currentScenario.extraPaymentAmount > 0) {
            currentScenario.title += ` + ${formatCurrency(currentScenario.extraPaymentAmount)} ${currentScenario.extraPaymentType === 'one-time' ? 'разово' : currentScenario.extraPaymentType === 'recurring' ? 'ежемес.' : `на ${currentScenario.nMonthsRecurringCount} мес.`}`;
        }

        if (savedScenarios.length >= MAX_SAVED_SCENARIOS) {
            savedScenarios.shift(); // Remove the oldest
        }
        savedScenarios.push(currentScenario);
        renderSavedScenarios();
        
        comparisonSection.style.display = 'block';
        savedScenariosContainer.style.display = 'block';
        displayFlashMessage('Сценарий сохранен!', 'success');
    }

    function renderSavedScenarios() {
        savedScenariosList.innerHTML = '';
        scenarioCountDisplay.textContent = `(${savedScenarios.length}/${MAX_SAVED_SCENARIOS})`;

        if (savedScenarios.length === 0) {
            savedScenariosList.innerHTML = '<p>Пока нет сохраненных сценариев.</p>';
            // Keep savedScenariosContainer visible to show this message, hide comparison area if it was for a removed scenario.
            // comparisonDisplayArea.style.display = 'none'; 
            return;
        }
        
        savedScenarios.forEach((scenario, index) => {
            const item = document.createElement('div');
            item.className = 'saved-scenario-item';
            
            let summary = `<span class="scenario-title">${scenario.title}</span>`;
            summary += `<p>Цель: ${scenario.goal === 'reduce_term' ? 'Сокращение срока' : 'Уменьшение платежа'}</p>`;
            summary += `<p>Новый платеж: ${scenario.newMonthlyPayment}, Новый срок: ${scenario.newTerm}</p>`;
            summary += `<p>Экономия: ${scenario.interestSaved}</p>`;
            
            item.innerHTML = `
                <div class="scenario-summary">${summary}</div>
                <div class="scenario-actions">
                    <button class="compare-btn" data-index="${index}">Сравнить с текущим</button>
                    <button class="remove-btn" data-index="${index}">Удалить</button>
                </div>
            `;
            savedScenariosList.appendChild(item);
        });
    }

    function removeScenario(index) {
        if (index < 0 || index >= savedScenarios.length) return;
        const removedScenarioTitle = savedScenarios[index].title;
        savedScenarios.splice(index, 1);
        renderSavedScenarios();
        displayFlashMessage(`Сценарий "${removedScenarioTitle}" удален.`, 'warning');

        if (savedScenarios.length === 0) {
            savedScenariosContainer.style.display = 'none'; // Hide if no scenarios left
            comparisonDisplayArea.style.display = 'none'; // Also hide comparison area
            comparisonSection.style.display = 'none';
        } else if (comparisonDisplayArea.style.display !== 'none' && 
                   comparisonDisplayArea.dataset.comparingIndex == index) { // Check if the removed was being compared
            comparisonDisplayArea.style.display = 'none'; // Hide comparison area
            delete comparisonDisplayArea.dataset.comparingIndex;
        }
         // Adjust indices if the currently compared scenario's index changed
        if (comparisonDisplayArea.dataset.comparingIndex && parseInt(comparisonDisplayArea.dataset.comparingIndex) > index) {
            comparisonDisplayArea.dataset.comparingIndex = parseInt(comparisonDisplayArea.dataset.comparingIndex) - 1;
        }

    }

    function compareScenario(index) {
        if (index < 0 || index >= savedScenarios.length) return;
        
        const saved = savedScenarios[index];
        const current = getCurrentScenarioDetails();

        const formatDetail = (label, value) => `<p><strong>${label}:</strong> ${value}</p>`;
        
        currentScenarioComparisonDetails.innerHTML = `
            ${formatDetail('Сумма кредита', formatCurrency(current.balance))}
            ${formatDetail('Ставка', `${current.rate}%`)}
            ${formatDetail('Срок', `${current.termValue} ${current.termUnit === 'years' ? 'лет' : 'мес.'}`)}
            ${current.extraPaymentAmount > 0 ? `
                ${formatDetail('Досрочный платеж', formatCurrency(current.extraPaymentAmount))}
                ${formatDetail('Тип платежа', current.extraPaymentType === 'one-time' ? 'Разовый' : current.extraPaymentType === 'recurring' ? 'Ежемесячный' : `Ежемесячно (${current.nMonthsRecurringCount} мес.)`)}
                ${formatDetail('Цель', current.goal === 'reduce_term' ? 'Сокращение срока' : 'Уменьшение платежа')}
            ` : '<p>Без досрочных платежей (базовый)</p>'}
            <hr>
            ${formatDetail('Ежемесячный платеж', current.newMonthlyPayment)}
            ${formatDetail('Срок кредита', current.newTerm)}
            ${formatDetail('Общая переплата', current.newTotalInterest)}
            ${formatDetail('Экономия на процентах', current.interestSaved)}
        `;

        savedScenarioComparisonDetails.innerHTML = `
            ${formatDetail('Сумма кредита', formatCurrency(saved.balance))}
            ${formatDetail('Ставка', `${saved.rate}%`)}
            ${formatDetail('Срок', `${saved.termValue} ${saved.termUnit === 'years' ? 'лет' : 'мес.'}`)}
             ${saved.extraPaymentAmount > 0 ? `
                ${formatDetail('Досрочный платеж', formatCurrency(saved.extraPaymentAmount))}
                ${formatDetail('Тип платежа', saved.extraPaymentType === 'one-time' ? 'Разовый' : saved.extraPaymentType === 'recurring' ? 'Ежемесячный' : `Ежемесячно (${saved.nMonthsRecurringCount} мес.)`)}
                ${formatDetail('Цель', saved.goal === 'reduce_term' ? 'Сокращение срока' : 'Уменьшение платежа')}
            ` : '<p>Без досрочных платежей (сохранен как базовый)</p>'}
            <hr>
            ${formatDetail('Ежемесячный платеж', saved.newMonthlyPayment)}
            ${formatDetail('Срок кредита', saved.newTerm)}
            ${formatDetail('Общая переплата', saved.newTotalInterest)}
            ${formatDetail('Экономия на процентах', saved.interestSaved)}
        `;
        
        comparisonSection.style.display = 'block';
        savedScenariosContainer.style.display = 'block'; // Ensure this is visible too
        comparisonDisplayArea.style.display = 'block';
        comparisonDisplayArea.dataset.comparingIndex = index; // Store which scenario is being compared
        displayFlashMessage(`Сравнение с сценарием: ${saved.title}`, 'success');
    }

    if (saveScenarioButton) {
        saveScenarioButton.addEventListener('click', saveScenario);
    }

    if (savedScenariosList) {
        savedScenariosList.addEventListener('click', function(event) {
            const target = event.target;
            if (target.classList.contains('compare-btn')) {
                compareScenario(parseInt(target.dataset.index));
            } else if (target.classList.contains('remove-btn')) {
                removeScenario(parseInt(target.dataset.index));
            }
        });
    }
    // Initialize scenario count display
    if(scenarioCountDisplay) scenarioCountDisplay.textContent = `(${savedScenarios.length}/${MAX_SAVED_SCENARIOS})`;

    // --- Extra Payment Slider Logic ---
    function formatSliderValue(value) {
        // Simple number formatting with spaces, no currency symbol for slider display
        return Number(value).toLocaleString('ru-RU');
    }

    function initExtraPaymentSlider() {
        if (!extraPaymentAmountSlider || !extraPaymentAmountInput || !extraPaymentAmountSliderValueDisplay) return;

        const initialVal = parseFloat(String(extraPaymentAmountInput.value || '0').replace(/ /g, ''));

        extraPaymentAmountSlider.min = "0";
        extraPaymentAmountSlider.max = "500000"; // Static initial max
        extraPaymentAmountSlider.step = "1000";
        extraPaymentAmountSlider.value = initialVal;
        extraPaymentAmountSliderValueDisplay.textContent = formatSliderValue(initialVal);

        extraPaymentAmountSlider.addEventListener('input', () => {
            const val = parseFloat(extraPaymentAmountSlider.value);
            extraPaymentAmountSliderValueDisplay.textContent = formatSliderValue(val);
        });

        extraPaymentAmountSlider.addEventListener('change', () => {
            const val = parseFloat(extraPaymentAmountSlider.value);
            // Update text input - simulate its input event for formatting
            extraPaymentAmountInput.value = val; // Set raw value
            const inputEvent = new Event('input', { bubbles: true, cancelable: true }); // Trigger its own formatting
            extraPaymentAmountInput.dispatchEvent(inputEvent); 
            
            // Recalculate
            calculateAndDisplayResults();
        });

        extraPaymentAmountInput.addEventListener('input', () => {
            // This event fires after formatNumericInput (which is also on 'input')
            // So, extraPaymentAmountInput.value is already formatted with spaces.
            const rawValue = parseFloat(String(extraPaymentAmountInput.value || '0').replace(/ /g, ''));
            
            if (!isNaN(rawValue)) {
                // Update slider position
                // Check if rawValue exceeds slider's current max and adjust max if necessary
                // For now, assuming static max, so we might need to cap or handle this.
                // For simplicity in this step, if text input exceeds slider max, slider just goes to its max.
                if (rawValue > parseFloat(extraPaymentAmountSlider.max)) {
                    // Optionally, update slider max here if dynamic max is desired later.
                    // For now, it will just be capped by the slider's own behavior if value is set beyond max.
                    // Or, we can set it to max.
                    // extraPaymentAmountSlider.value = extraPaymentAmountSlider.max;
                }
                extraPaymentAmountSlider.value = rawValue; // Slider will cap it if rawValue > max

                // Update slider's own value display
                extraPaymentAmountSliderValueDisplay.textContent = formatSliderValue(extraPaymentAmountSlider.value); // Display actual slider value
            }
        });
    }
    
    // Call initializers
    initExtraPaymentSlider();
    // --- End Extra Payment Slider Logic ---

    // --- Form Validation Logic ---
    const inputsToValidate = [
        balanceInput, 
        document.getElementById('rate'), 
        document.getElementById('term_value'), 
        extraPaymentAmountInput,
        document.getElementById('n_months_recurring_count')
    ];

    function validateField(inputElement) {
        if (!inputElement) return true; // Should not happen if inputsToValidate is correct

        // Special handling for n_months_recurring_count if it's not visible
        if (inputElement.id === 'n_months_recurring_count' && nMonthsInputGroup.style.display === 'none') {
            inputElement.classList.remove('is-invalid');
            const errorSpan = document.getElementById(inputElement.id + '-error');
            if (errorSpan) errorSpan.textContent = '';
            return true; 
        }
        
        const errorSpan = document.getElementById(inputElement.id + '-error');
        if (!errorSpan) {
            console.warn('No error span found for input:', inputElement.id);
            // Fallback for validity check even if span is missing for some reason
            if (!inputElement.validity.valid) {
                inputElement.classList.add('is-invalid');
            } else {
                inputElement.classList.remove('is-invalid');
            }
            return inputElement.validity.valid;
        }

        if (!inputElement.validity.valid) {
            inputElement.classList.add('is-invalid');
            errorSpan.textContent = inputElement.validationMessage;
        } else {
            inputElement.classList.remove('is-invalid');
            errorSpan.textContent = '';
        }
        return inputElement.validity.valid;
    }

    function validateForm() {
        let isFormValid = true;
        inputsToValidate.forEach(input => {
            if (input) { // Ensure input exists
                 // For text inputs that are formatted (balance, extra_payment_amount), 
                 // ensure their underlying value is checked if HTML5 validation fails due to formatting.
                 // However, min/required should still work with HTML5 for type=number or even text if pattern is used.
                 // For now, relying on HTML5 validation properties.
                if (!validateField(input)) {
                    isFormValid = false;
                }
            }
        });
        return isFormValid;
    }

    inputsToValidate.forEach(input => {
        if (input) {
            input.addEventListener('blur', () => validateField(input));
        }
    });
    
    // Modify form submit listener
    form.addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent default regardless of validation, as we handle it all
        clearFlashMessages(); // Clear general flash messages first

        if (validateForm()) {
            calculateAndDisplayResults();
        } else {
            // Optionally, display a general flash message about fixing errors, though individual field errors are primary.
            displayFlashMessage("Пожалуйста, исправьте ошибки в форме.", "error");
            // Hide results and other sections if form is invalid
            if(resultsSection) resultsSection.style.display = 'none';
            if(resultsActionsDiv) resultsActionsDiv.style.display = 'none';
            if(document.getElementById('amortization-schedules')) document.getElementById('amortization-schedules').style.display = 'none';
            if(saveScenarioButton) saveScenarioButton.style.display = 'none';

        }
    });
    // --- End Form Validation Logic ---


    function renderSchedule(tableId, scheduleData) {
        const table = document.getElementById(tableId);
        if (!table) {
            console.error(`Table with id ${tableId} not found.`);
            return;
        }
        const tbody = table.getElementsByTagName('tbody')[0];
        if (!tbody) {
            console.error(`Tbody for table ${tableId} not found.`);
            return;
        }
        tbody.innerHTML = ''; // Clear existing rows

        if (!scheduleData || scheduleData.length === 0) {
            const tr = tbody.insertRow();
            const td = tr.insertCell();
            td.colSpan = 5; // Number of columns in the table
            td.textContent = 'Нет данных для отображения.';
            td.style.textAlign = 'center';
            return;
        }

        scheduleData.forEach(row => {
            const tr = tbody.insertRow();
            
            const monthCell = tr.insertCell();
            monthCell.textContent = row.month;
            
            const paymentCell = tr.insertCell();
            paymentCell.textContent = formatCurrency(row.payment);
            
            const interestCell = tr.insertCell();
            interestCell.textContent = formatCurrency(row.interest);
            
            const principalCell = tr.insertCell();
            principalCell.textContent = formatCurrency(row.principal);
            
            const balanceCell = tr.insertCell();
            balanceCell.textContent = formatCurrency(row.balance);
        });
    }

    function showSchedule(scheduleType, clickedButton) {
        const displays = document.querySelectorAll('.schedule-display');
        displays.forEach(display => display.style.display = 'none');

        const buttons = document.querySelectorAll('.tab-button');
        buttons.forEach(button => button.classList.remove('active'));

        const activeDisplay = document.getElementById(scheduleType + '-schedule-display');
        if (activeDisplay) {
            activeDisplay.style.display = 'block';
        }
        if (clickedButton) {
            clickedButton.classList.add('active');
        }
    }
    // Make showSchedule globally available for onclick
    window.showSchedule = showSchedule;


    function generateAmortizationSchedule(principal, monthlyRate, monthlyPayment, loanTermMonths, startMonthOffset = 0) {
        const scheduleData = [];
        let currentBalance = principal;

        if (principal <= 0.01 || monthlyPayment <= 0 || loanTermMonths <= 0) { // No schedule if no loan or no payments/term
            if (principal <= 0.01 && loanTermMonths === 0) return [{ month: 1 + startMonthOffset, payment: 0, principal: 0, interest: 0, balance: 0 }];
            return [];
        }

        for (let month = 1; month <= loanTermMonths; month++) {
            if (currentBalance <= 0.01) break;

            let interestPaid = currentBalance * monthlyRate;
            let principalPaid = monthlyPayment - interestPaid;
            let interestPaid = currentBalance * monthlyRate;
            let principalPaid = monthlyPayment - interestPaid;
            let actualPaymentThisMonth = monthlyPayment;

            // Check if this is the last payment or if the standard payment overpays
            if (currentBalance - principalPaid <= 0.01 || month >= loanTermMonths) { 
                // loanTermMonths might be fractional, so month >= loanTermMonths means we are at or beyond the calculated term end.
                // Or, the calculated principal portion would clear or overpay the balance.
                principalPaid = currentBalance; // Pay exactly the remaining balance
                actualPaymentThisMonth = currentBalance + interestPaid;
                currentBalance = 0;
            } else {
                currentBalance -= principalPaid;
            }
            
            // Ensure balance doesn't go below zero due to tiny fp errors on final payment
            // This check should ideally be redundant if logic above is perfect.
            if (currentBalance < 0) {
                currentBalance = 0;
            }

            scheduleData.push({
                month: month + startMonthOffset,
                payment: actualPaymentThisMonth,
                principal: principalPaid,
                interest: interestPaid,
                balance: currentBalance
            });

            if (currentBalance <= 0.01) break; 
        }
        return scheduleData;
    }
    
    // Function to create or update the loan pie chart
    function updateLoanChart(principal, interest) {
        // Dynamically adjust slider max based on principal, if P_current is available
        if (principal > 0 && extraPaymentAmountSlider) {
            const currentSliderMax = parseFloat(extraPaymentAmountSlider.max);
            // Set max to principal or a fraction, but not less than a minimum sensible value like 50k, or its current value if that's higher
            let newMax = Math.max(50000, Math.round(principal / 1000) * 1000); 
            if (newMax > 2000000) newMax = 2000000; // Absolute cap for sanity
            
            const currentSliderVal = parseFloat(extraPaymentAmountSlider.value);
            extraPaymentAmountSlider.max = newMax;

            // If current value was somehow above new max (e.g. text input changed it before this ran)
            // and then principal decreased, slider should adjust.
            if (currentSliderVal > newMax) {
                extraPaymentAmountSlider.value = newMax;
                 extraPaymentAmountSliderValueDisplay.textContent = formatSliderValue(newMax);
                 // Also update text field if slider was forced down
                 extraPaymentAmountInput.value = newMax;
                 const inputEvent = new Event('input', { bubbles: true, cancelable: true });
                 extraPaymentAmountInput.dispatchEvent(inputEvent);
            }
        }

        const ctx = document.getElementById('loanChart').getContext('2d');
        
        // Destroy previous chart if it exists
        if (loanChart) {
            loanChart.destroy();
        }
        
        // Format data for the chart
        const data = {
            labels: ['Тело кредита', 'Проценты'],
            datasets: [{
                data: [principal, interest],
                backgroundColor: ['#A9CCE3', '#EAECEE'], // Updated: Light Blue for principal, Light Grey for interest
                hoverBackgroundColor: ['#7FB3D5', '#D5D8DC'], // Updated: Slightly darker shades for hover
                borderWidth: 1
            }]
        };
        
        // CSS Variables for chart styling
        const rootStyles = getComputedStyle(document.documentElement);
        const chartTextColor = rootStyles.getPropertyValue('--text-color').trim() || '#212529';
        const chartContainerBgColor = rootStyles.getPropertyValue('--container-bg-color').trim() || '#ffffff';
        const chartBorderColor = rootStyles.getPropertyValue('--border-color').trim() || '#CED4DA';

        // Chart options
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: {
                            size: 16 // Maintained legend font size
                        },
                        color: chartTextColor // Updated legend text color
                    }
                },
                tooltip: {
                    backgroundColor: chartContainerBgColor, // Updated tooltip background
                    titleFont: {
                        size: 16, // Maintained tooltip title font size
                        // color: chartTextColor // Title color will also be chartTextColor by default if not specified for titleColor
                    },
                    bodyFont: {
                        size: 14 // Maintained tooltip body font size
                    },
                    borderColor: chartBorderColor, // Updated tooltip border color
                    borderWidth: 1, // Set tooltip border width
                    titleColor: chartTextColor, // Explicitly set title text color
                    bodyColor: chartTextColor, // Explicitly set body text color
                    displayColors: false, // Hide color boxes in tooltip for cleaner look
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        };
        
        // Create new chart
        loanChart = new Chart(ctx, {
            type: 'pie',
            data: data,
            options: options
        });
    }
});

