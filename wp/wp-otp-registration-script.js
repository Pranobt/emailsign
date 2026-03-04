jQuery(document).ready(function ($) {
    function toggleSendOtpButton() {
        const mobileValue = ($("#mobile").val() || "").trim();
        const shouldShow = mobileValue.length > 0 && !$("#otp-section").is(":visible");
        $("#registration-send-otp").toggle(shouldShow);
    }

    // Hidden by default; shown only after user starts typing mobile number.
    $("#registration-send-otp").hide();


    $("#name").on("input", function () {
        $(this).val($(this).val().replace(/[^a-zA-Z\s]/g, ""));
    });

    $("input").attr("autocomplete", "off");

    $("#mobile").on("input", function () {
        let mobileNumber = $(this).val();

        // Allow only numeric input & limit to 10 digits
        mobileNumber = mobileNumber.replace(/[^0-9]/g, '').substring(0, 10);
        $(this).val(mobileNumber);
        toggleSendOtpButton();

        // Mobile number validation pattern
        let mobilePattern = /^[6789]\d{9}$/;

        if (mobileNumber.length === 0) {
            $("#mobile-error").text("");
        } else if (mobileNumber.length < 10) {
            $("#mobile-error").text("Mobile number must be 10 digits.");
        } else if (!mobilePattern.test(mobileNumber)) {
            $("#mobile-error").text("Enter a valid Indian mobile number.");
        } else {
            $("#mobile-error").text(""); // Clear error message if valid
        }
    });

    toggleSendOtpButton();


    let countdownInterval;

    function startCountdown(expiryTimestamp) {
        clearInterval(countdownInterval);
        let countdownElement = $('#otp-timer');
        let resendButton = $('#registration-resend-otp');

        let verifyBtn = $('#verify-otp');

        function updateCountdown() {
            let currentTime = Math.floor(Date.now() / 1000);
            let remainingTime = expiryTimestamp - currentTime;

            if (remainingTime <= 0) {
                clearInterval(countdownInterval);
                countdownElement.text('OTP expired.');
                resendButton.show(); // Show resend button
                verifyBtn.hide();
                return;
            }

            let minutes = Math.floor(remainingTime / 60);
            let seconds = remainingTime % 60;
            countdownElement.text(`OTP expires in ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
        }

        updateCountdown(); // Initial call
        countdownInterval = setInterval(updateCountdown, 1000); // Update every second
    }

    $('#registration-send-otp, #registration-resend-otp').click(function () {

        var mobile = $('#mobile').val();

        if (mobile.length < 10) {
            //alert('Please enter a valid 10-digit mobile number.');
            $("#mobile-error").text("Please enter a valid 10-digit mobile number.");
            return;
        }

        $.ajax({
            url: ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'registration_send_otp_whatsapp',
                mobile: mobile
            },
            beforeSend: function () {
                $('#registration-send-otp').prop('disabled', true).text('Sending...');
                $('#registration-resend-otp').hide(); // Hide resend button
            },
            success: function (response) {


                if (response.success) {

                    if (response.data.status == "dev") {
                        alert(response.data.message);
                    }

                    $('#otp-section').show();
                    $('#otp-timer').show();
                    $('#registration-send-otp').hide();
                    $('#otp').attr('required', true);
                    $('#registration-verify-otp').show();
                    $('#is_top_sent').val(1);
                    $('#otp-success-message').html('').hide();
                    startCountdown(response.data.expires_at); // Start countdown
                } else {
                    alert(response.data.message || 'Failed to send OTP.');
                }
            },
            complete: function () {
                $('#registration-send-otp').prop('disabled', false).text('Send OTP');
            }
        });
    });

    $('#registration-verify-otp').click(function () {
        var mobile = $('#mobile').val();
        var otp = $('#otp').val();

        if (otp.length !== 6) {
            //alert('Please enter a valid 6-digit OTP.');
            $("#otp-error").text("Please enter a valid 6-digit OTP.");
            return;
        }

        $.ajax({
            url: ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'registration_validate_otp_whatsapp',
                mobile: mobile,
                otp: otp
            },
            beforeSend: function () {
                $('#registration-verify-otp').prop('disabled', true).text('Verifying...');
            },
            success: function (response) {
                if (response.success) {
                    $("#otp_verified").val(1); // Set OTP verified
                    $('#otp-section').hide(); // Hide OTP input section
                    $('#otp-success-message').html('<span style="color: green; font-weight: bold;">Mobile verified successfully!</span>').show();
                    $('#registration-send-otp').hide(); // Hide send OTP button
                } else {
                    $("#otp_verified").val(0);
                    //alert(response.data.message);
                    $("#otp-error").text(response.data.message);
                }
            },
            complete: function () {
                $('#registration-verify-otp').prop('disabled', false).text('Verify OTP');
            }
        });
    });

    $('#wp-otp-registration').on('submit', function (e) {
        e.preventDefault();

        let isValid = true; // Validation flag

        // Clear previous error messages
        $(".error-message").text("");

        // Get field values
        let name = $("#name").val().trim();
        let email = $("#email").val().trim();
        let indstate = $("#indstate").val().trim();
        let mobile = $("#mobile").val().trim();
        let otpVerified = $("#otp_verified").val();
        let isOtpSend = $('#is_top_sent').val();

        let drn = $("#drn").val().trim();

        // Name validation
        if (name === "") {
            $("#name-error").text("Name is required.");
            isValid = false;
        }

        // Email validation
        let emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
            $("#email-error").text("Enter a valid email address.");
            isValid = false;
        }

        // Mobile number validation (10 digits)
        let mobilePattern = /^[0-9]{10}$/;
        if (!mobilePattern.test(mobile)) {
            $("#mobile-error").text("Enter a valid 10-digit mobile number.");
            isValid = false;
        }

        // Password length validation (min 6 characters)
        if (indstate === "") {
            $("#indstate-error").text("Medical Council State is required");
            isValid = false;
        }

        // UIN validation
        if (drn === "") {
            $("#drn-error").text("Doctor Registration Number is required.");
            isValid = false;
        }

        // Stop form submission if any validation fails
        if (!isValid) return;

        if (otpVerified !== "1" && isOtpSend !== "1") {
            //errorMessage.text("Please verify OTP to process registration.").show();
            $('#otp-success-message').html('<span style="color: red; font-weight: bold;">Please verify OTP to complete registration.</span>').show();
            isValid = false;
        } else if (otpVerified !== "1" && isOtpSend == "1") {
            $('#otp-success-message').html('<span style="color: red; font-weight: bold;">Please verify OTP to complete registration.</span>').show();
            isValid = false;
        } else {

            // Get the URL parameters
            let params = new URLSearchParams(window.location.search);

            // Read specific parameters
            let utm_source = params.get("utm_source") ?? 'Organic';
            let utm_medium = params.get("utm_medium") ?? 'Website';
            let utm_campaign = params.get("utm_campaign") ?? 'DirectCommunitySignup';
            let utm_term = params.get("utm_term") ?? 'Community';
            let utm_content = params.get("utm_content") ?? 'RxFinnversity';

            var formData = $(this).serialize() + '&action=wp_otp_register_user' +
                '&utm_source=' + utm_source +
                '&utm_medium=' + utm_medium +
                '&utm_campaign=' + utm_campaign +
                '&utm_term=' + utm_term +
                '&utm_content=' + utm_content;

            $.post(ajax_object.ajax_url, formData, function (response) {

                console.log(response);

                if (response.success) {

                    let message = response.data.message;


                    $("#wp-otp-registration")[0].reset();
                    $("#registration-send-otp").hide();

                    let postParams = JSON.parse(sessionStorage.getItem('postParams') || '{}');
                    let responseParams = JSON.parse(sessionStorage.getItem('responseParams') || '{}');

                    if (Object.keys(postParams).length > 0 && Object.keys(responseParams).length > 0) {

                        jQuery.ajax({
                            type: "POST",
                            url: ffc_ajax_obj.ajax_url,
                            data: {
                                action: "save_fire_calculation",
                                post: postParams,
                                response: responseParams,
                                user_id: response.data.user_id
                            },
                            success: function (res) {

                                sessionStorage.removeItem('postParams');
                                sessionStorage.removeItem('responseParams');

                                Swal.fire({
                                    toast: true,
                                    position: 'top-end',
                                    icon: 'success',
                                    html: '<span style="color: green; font-weight: bold;">' + message + '</span>',
                                    showConfirmButton: false,
                                    timer: 3000,
                                    timerProgressBar: true
                                }).then(() => {
                                    // Redirect after alert closes
                                    window.location.href = "thank-you";
                                });
                            }
                        });

                    } else {

                        Swal.fire({
                            toast: true,
                            position: 'top-end',
                            icon: 'success',
                            html: '<span style="color: green; font-weight: bold;">' + message + '</span>',
                            showConfirmButton: false,
                            timer: 3000,
                            timerProgressBar: true
                        }).then(() => {
                            // Redirect after alert closes
                            window.location.href = "thank-you";
                        });

                    }



                } else {

                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'error',
                        html: '<span style="color: red; font-weight: bold;">Registration failed. Please try again after sometimes</span>',
                        showConfirmButton: false,
                        timer: 3000,
                        timerProgressBar: true
                    }).then(() => {
                        // Redirect after alert closes
                        window.location.reload();

                    });
                }
            });
        }

    });

});
