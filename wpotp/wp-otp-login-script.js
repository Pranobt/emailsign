jQuery(document).ready(function ($) {

    $("input").attr("autocomplete", "off");

    $('#login-verify-otp').hide();

    $("#mobile").on("input", function () {
        let mobileNumber = $(this).val();

        // Allow only numeric input & limit to 10 digits
        mobileNumber = mobileNumber.replace(/[^0-9]/g, '').substring(0, 10);
        $(this).val(mobileNumber);

        // Mobile number validation pattern
        let mobilePattern = /^[6789]\d{9}$/;

        if (mobileNumber.length < 10) {
            $("#mobile-error").text("Mobile number must be 10 digits.");
        } else if (!mobilePattern.test(mobileNumber)) {
            $("#mobile-error").text("Enter a valid Indian mobile number.");
        } else {
            $("#mobile-error").text(""); // Clear error message if valid
        }
    });


    let countdownInterval;

    function startCountdownOLD(expiryTimestamp) {
        clearInterval(countdownInterval);
        let countdownElement = $('#otp-timer');
        let resendButton = $('#login-resend-otp');

        let verifyBtn = $('#login-verify-otp');

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
    
function startCountdown(expiresAtUnix) {
    clearInterval(countdownInterval);

    let countdownElement = $('#otp-timer');
    let resendButton = $('#login-resend-otp');
    let verifyBtn = $('#login-verify-otp');

    function updateCountdown() {
        let now = Math.floor(Date.now() / 1000);     // current UNIX timestamp (sec)
        let remainingTime = expiresAtUnix - now;     // time left in seconds

        if (remainingTime <= 0) {
            clearInterval(countdownInterval);
            countdownElement.text('OTP expired.');
            resendButton.show();
            verifyBtn.hide();
            return;
        }

        let minutes = Math.floor(remainingTime / 60);
        let seconds = remainingTime % 60;

        countdownElement.text(
            `OTP expires in ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
        );
    }

    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}


function getUrlParam(key) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(key);
}


    $('#login-send-otp, #login-resend-otp').click(function () {

        var mobile = $('#mobile').val();

        if (mobile.length < 10) {
            $("#mobile-error").text("Please enter a valid 10-digit mobile number.");
            return;
        }

        // Mobile number validation (10 digits)
        let mobilePattern = /^[0-9]{10}$/;
        if (!mobilePattern.test(mobile)) {
            $("#mobile-error").text("Enter a valid 10-digit mobile number.");
            return;
        }
        
        let bypassValue = getUrlParam('bypassfinotp');
        $.ajax({
            url: ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'wp_login_send_otp',
                mobile: mobile,
                bypassfinotp: bypassValue
            },
            beforeSend: function () {
                $('#login-send-otp').prop('disabled', true).text('Sending...');
                $('#login-resend-otp').hide(); // Hide resend button
            },
            success: function (response) {


                if (response.success) {

                    if (response.data.status == "dev") {
                        alert(response.data.message);
                    }

                    $('#otp-section').show();
                    $('#otp-timer').show();
                    $('#login-send-otp').hide();
                    $('#otp').attr('required', true);
                    $('#login-verify-otp').show();
                    $('#otp-success-message').html('').hide();
                    startCountdown(response.data.expires_at); // Start countdown
                } else {
                    $("#mobile-error").text(response.data.message || response.data || 'Failed to send OTP.');
                    //alert(response.data.message || 'Failed to send OTP.');
                }
            },
            complete: function () {
                $('#login-send-otp').prop('disabled', false).text('Sign In via OTP');
            }
        });
    });


    $('#wp-otp-signin').on('submit', function (e) {
        e.preventDefault();

        let isValid = true; // Validation flag

        // Clear previous error messages
        $(".error-message").text("");

        var mobile = $('#mobile').val();
        var otp = $('#otp').val();

        if (otp.length !== 6) {
            //alert('Please enter a valid 6-digit OTP.');
            $("#otp-error").text("Please enter a valid 6-digit OTP.");
            isValid = false;
        }

        if (mobile.length < 10) {
            $("#mobile-error").text("Please enter a valid 10-digit mobile number.");
            isValid = false;
        }

        // Mobile number validation (10 digits)
        let mobilePattern = /^[0-9]{10}$/;
        if (!mobilePattern.test(mobile)) {
            $("#mobile-error").text("Enter a valid 10-digit mobile number.");
            isValid = false;
        }

        // Stop form submission if any validation fails
        if (!isValid) return;


        $.ajax({
            url: ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'validate_sign_in_otp',
                mobile: mobile,
                otp: otp
            },
            beforeSend: function () {
                $('#login-verify-otp').prop('disabled', true).text('Verifying...');
            },
            success: function (response) {
                if (response.success) {
                    $("#wp-otp-signin")[0].reset();

                    let referer = document.referrer;

                    if (referer.includes('fire-calculator')) {

                        // Get session storage data
                        let postParams = JSON.parse(sessionStorage.getItem('postParams') || '{}');
                        let responseParams = JSON.parse(sessionStorage.getItem('responseParams') || '{}');

                        jQuery.ajax({
                            type: "POST",
                            url: ffc_ajax_obj.ajax_url,
                            data: {
                                action: "save_fire_calculation",
                                post: postParams,
                                response: responseParams
                            },
                            success: function (res) {

                                sessionStorage.removeItem('postParams');
                                sessionStorage.removeItem('responseParams');

                                Swal.fire({
                                    toast: true,
                                    position: 'top-end',
                                    icon: 'success',
                                    html: '<span style="color: green; font-weight: bold;">' + response.data.message + '</span>',
                                    showConfirmButton: false,
                                    timer: 3000,
                                    timerProgressBar: true
                                }).then(() => {

                                    // If referer contains 'sign-up', redirect to home
                                    if (referer.includes('sign-up')) {
                                        window.location.href = "/";
                                    } else {
                                        window.location.href = referer ? referer : "/";
                                    }


                                });


                            }
                        });


                    } else {

                        Swal.fire({
                            toast: true,
                            position: 'top-end',
                            icon: 'success',
                            html: '<span style="color: green; font-weight: bold;">' + response.data.message + '</span>',
                            showConfirmButton: false,
                            timer: 3000,
                            timerProgressBar: true
                        }).then(() => {

                            // If referer contains 'sign-up', redirect to home
                            if (referer.includes('sign-up')) {
                                window.location.href = "/";
                            } else {
                                window.location.href = referer ? referer : "/";
                            }

                        });
                    }



                } else {
                    $("#otp-error").text(response.data.message);
                }
            },
            complete: function () {
                $('#login-verify-otp').prop('disabled', false).text('Verify OTP');
            }
        });

    });

});
