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
            let P_remaining_after_N = P_current;
            let Total_Paid_During_N_Period = 0;
            const M_effective_N = M_baseline + E_extra;

            if (M_effective_N <= P_remaining_after_N * monthly_r && monthly_r > 0 && P_remaining_after_N > 0) {
                displayFlashMessage(`Платеж ${formatCurrency(M_effective_N)} недостаточен для покрытия процентов в период N платежей.`, "error");
                return;
            }
            let actual_n_months_paid = 0;
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
            } else if (P_remaining_after_N <=0) { // Paid off within N months
                 term_display_val = actual_n_months_paid;
            } else { // Not paid off after N, and calculation for after N failed
                 term_display_val = Infinity; // Or show something like 'N + не погашается'
            }
        }
        document.getElementById('result-new-term').textContent = formatTerm(term_display_val);

        document.getElementById('result-old-total-interest').textContent = formatCurrency(Total_Interest_Old);
        document.getElementById('result-new-total-interest').textContent = formatCurrency(Total_Interest_New);
        document.getElementById('result-interest-saved').textContent = formatCurrency(Interest_Saved);

        // Create or update the pie chart
        updateLoanChart(P_current, Total_Interest_New);

        if (Interest_Saved > 0) {
            displayFlashMessage(`Отлично! Вы сэкономите ${formatCurrency(Interest_Saved)} на процентах.`, 'success');
        } else if (Total_Interest_New < Total_Interest_Old) {
             displayFlashMessage('Параметры кредита обновлены.', 'success');
        } else if (P_current > 0 && M_new_scheduled === 0 && N_new_months_calc === 0) {
            displayFlashMessage('Кредит будет полностью погашен досрочным платежом!', 'success');
        }

    }
    
    // Function to create or update the loan pie chart
    function updateLoanChart(principal, interest) {
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
                backgroundColor: ['#add8e6', '#d3d3d3'], // Light Blue for principal, Light Grey for interest
                hoverBackgroundColor: ['#9fccde', '#c0c0c0'], // Slightly darker shades for hover
                borderWidth: 1
            }]
        };
        
        // Chart options
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: {
                            size: 16 // Increased legend font size
                        }
                    }
                },
                tooltip: {
                    bodyFont: {
                        size: 14 // Increased tooltip body font size
                    },
                    titleFont: {
                        size: 16 // Increased tooltip title font size
                    },
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

