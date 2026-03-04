<?php

/*
 * Plugin Name: WP OTP Registration
 * Plugin URI: https://rx.finnovate.in
 * Description: Custom registration form with mobile OTP validation.
 * Version: 1.0
 * Author: Anoj Tambe
 * Author URI: https://rx.finnovate.in
 * License: GPL2
 */

// Enqueue scripts and styles
function wp_otp_enqueue_scripts()
{
    $script_path = plugin_dir_path(__FILE__) . 'wp-otp-registration-script.js';
    $style_path = plugin_dir_path(__FILE__) . 'wp-otp-registration-style.css';

    $script_ver = file_exists($script_path) ? filemtime($script_path) : null;
    $style_ver = file_exists($style_path) ? filemtime($style_path) : null;

    wp_enqueue_script('jquery');
    wp_enqueue_script('wp-otp-registration-script', plugin_dir_url(__FILE__) . 'wp-otp-registration-script.js', array('jquery'), $script_ver, true);
    wp_enqueue_style('wp-otp-registration-style', plugin_dir_url(__FILE__) . 'wp-otp-registration-style.css', array(), $style_ver);
    wp_localize_script('wp-otp-registration-script', 'ajax_object', array('ajax_url' => admin_url('admin-ajax.php')));
}

add_action('wp_enqueue_scripts', 'wp_otp_enqueue_scripts');

// Shortcode for registration form
function wp_otp_registration_form()
{
    ob_start();
?>

<div id="user_registerform" class="card-main socialv-bp-login">
    <div class="card-inner">
        <div class="socialv-login-form">
            <div class="otp-form-header">
                <span class="otp-badge">Doctor Community</span>
                <h4 class="logo-title">Create Your Account</h4>
                <p class="otp-subtitle">Secure signup with OTP verification in under a minute.</p>
            </div>

            <form id="wp-otp-registration" class="otp-form-shell" novalidate autocomplete="off">
                <div class="row">
                    <div class="col-md-12 mb-3 otp-field">
                        <div class="register-firstname">
                            <label for="name">Full Name</label>
                            <div class="input-group mb-0">
                                <span class="input-group-text"><i class="iconly-Add-User icli"></i></span>
                                <input class="form-control" name="name" id="name" type="text" placeholder="Enter your full name" required>
                            </div>
                            <span id="name-error" class="error-message"></span>
                        </div>
                    </div>

                    <div class="col-md-12 mb-3 otp-field">
                        <div class="register-username">
                            <label for="mobile">Mobile Number *</label>
                            <div class="input-group mb-0">
                                <span class="input-group-text"><i class="iconly-Lock icli"></i></span>
                                <input type="text" class="form-control" name="mobile" id="mobile" placeholder="Enter 10-digit mobile number" required>
                                <button type="button" id="registration-send-otp" class="socialv-button atButton">Send OTP</button>
                            </div>
                            <span id="mobile-error" class="error-message"></span>

                            <input type="hidden" id="otp_verified" name="otp_verified" value="0">
                            <input type="hidden" id="is_top_sent" name="is_top_sent" value="0">

                            <div id="otp-section" style="display: none;">
                                <div class="input-group mb-2 mt-2">
                                    <span class="input-group-text"><i class="iconly-Lock icli"></i></span>
                                    <input type="text" class="form-control" name="verify_otp" id="otp" placeholder="Enter 6-digit OTP" required>
                                    <button type="button" id="registration-verify-otp" class="socialv-button atButton">Verify OTP</button>
                                    <button type="button" id="registration-resend-otp" style="display: none;" class="socialv-button atButton">Resend OTP</button>
                                </div>
                                <p id="otp-timer" style="color: red;"></p>
                                <span id="otp-error" class="error-message"></span>
                            </div>

                            <p id="otp-success-message"></p>
                        </div>
                    </div>

                    <div class="col-md-12 mb-3 otp-field">
                        <div class="register-emailname">
                            <label for="email">Email Address *</label>
                            <div class="input-group mb-0">
                                <span class="input-group-text"><i class="iconly-Message icli"></i></span>
                                <input class="form-control" name="email" id="email" type="email" placeholder="Enter your email address" required>
                            </div>
                            <span id="email-error" class="error-message"></span>
                        </div>
                    </div>

                    <div class="col-md-12 mb-3 otp-field">
                        <div class="register-password">
                            <label for="drn">Doctor Registration Number *</label>
                            <div class="input-group mb-0">
                                <span class="input-group-text"><i class="iconly-Lock icli"></i></span>
                                <input class="form-control socialv-password-field" name="drn" id="drn" type="text" placeholder="Enter doctor registration number" required>
                            </div>
                            <span id="drn-error" class="error-message"></span>
                        </div>
                    </div>

                    <div class="col-md-12 mb-3 otp-field">
                        <div class="register-password">
                            <label for="indstate">State Council</label>
                            <div class="input-group mb-0">
                                <span class="input-group-text"><i class="iconly-Category icli"></i></span>
                                <select class="form-control" name="indstate" id="indstate" required>
                                    <option value="Maharashtra">Maharashtra</option>
                                    <option value="Andhra Pradesh">Andhra Pradesh</option>
                                    <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                                    <option value="Assam">Assam</option>
                                    <option value="Bihar">Bihar</option>
                                    <option value="Chhattisgarh">Chhattisgarh</option>
                                    <option value="Goa">Goa</option>
                                    <option value="Gujarat">Gujarat</option>
                                    <option value="Haryana">Haryana</option>
                                    <option value="Himachal Pradesh">Himachal Pradesh</option>
                                    <option value="Jharkhand">Jharkhand</option>
                                    <option value="Karnataka">Karnataka</option>
                                    <option value="Kerala">Kerala</option>
                                    <option value="Madhya Pradesh">Madhya Pradesh</option>
                                    <option value="Manipur">Manipur</option>
                                    <option value="Meghalaya">Meghalaya</option>
                                    <option value="Mizoram">Mizoram</option>
                                    <option value="Nagaland">Nagaland</option>
                                    <option value="Odisha">Odisha</option>
                                    <option value="Punjab">Punjab</option>
                                    <option value="Rajasthan">Rajasthan</option>
                                    <option value="Sikkim">Sikkim</option>
                                    <option value="Tamil Nadu">Tamil Nadu</option>
                                    <option value="Telangana">Telangana</option>
                                    <option value="Tripura">Tripura</option>
                                    <option value="Uttar Pradesh">Uttar Pradesh</option>
                                    <option value="Uttarakhand">Uttarakhand</option>
                                    <option value="West Bengal">West Bengal</option>
                                </select>
                            </div>
                            <span id="indstate-error" class="error-message"></span>
                        </div>
                    </div>

                    <div class="col-md-12 socialv-auth-button otp-field">
                        <button type="submit" class="socialv-button w-100 atButton" value="Register">Create Account</button>
                    </div>
                </div>
            </form>

            <div class="col-md-12 text-center">
                <p class="register-link">Already have an account?<a id="user_forget_form" href="sign-in" class="socialv-button socialv-button-link">Login</a></p>
            </div>
        </div>
    </div>
</div>

<div id="message"></div>
<?php
    return ob_get_clean();
}

add_shortcode('wp_otp_registration', 'wp_otp_registration_form');

function registration_send_otp_whatsapp()
{
    $mobile = sanitize_text_field($_POST['mobile']);
    $otp = rand(100000, 999999);

    $testing_mode = false;  // Set to `true` to bypass actual API for testing

    // Normalize the WhatsApp number
    if (strlen($mobile) == 10) {
        $whatsappNumber = '91' . $mobile;
    } elseif (strlen($mobile) == 12 && substr($mobile, 0, 2) != '91') {
        $whatsappNumber = '91' . substr($mobile, 2);
    } else {
        wp_send_json_error(['message' => 'Invalid mobile number format.']);
    }

    $expires_at = time() + 300;  // 600 seconds = 10 minutes

    // Store OTP in the database (set expiry time of 10 minutes)
    update_option('otp_' . $mobile, json_encode([
        'otp' => $otp,
        'expires_at' => $expires_at  // OTP valid for 10 minutes
    ]));

    // Bypass actual API if in testing mode
    if ($testing_mode) {
        wp_send_json_success([
            'message' => "Testing mode enabled. OTP is: $otp",
            'expires_at' => $expires_at,
            'status' => 'dev'
        ]);
    } else {
        // Initialize cURL
        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL => "https://live-mt-server.wati.io/309213/api/v1/sendTemplateMessage?whatsappNumber={$whatsappNumber}",
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 0,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'POST',
            CURLOPT_POSTFIELDS => json_encode([
                'template_name' => 'finnovate_otp',
                'broadcast_name' => 'finnovate_otp',
                'parameters' => [
                    [
                        'name' => '1',
                        'value' => $otp
                    ]
                ]
            ]),
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmNjdkYjI3Zi01NzAxLTRmMjItODhiOC05NmRhOGEzMmUyMWQiLCJ1bmlxdWVfbmFtZSI6ImFub2oudGFtYmVAZmlubm92YXRlLmluIiwibmFtZWlkIjoiYW5vai50YW1iZUBmaW5ub3ZhdGUuaW4iLCJlbWFpbCI6ImFub2oudGFtYmVAZmlubm92YXRlLmluIiwiYXV0aF90aW1lIjoiMTIvMjQvMjAyNCAxMzowNToxNyIsInRlbmFudF9pZCI6IjMwOTIxMyIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.m1O1ZSMc9ItLnQa1z_f5sIDidxuSTmgnRe7M2F28vB0',
                'Content-Type: application/json'
            ],
        ]);

        // Execute cURL request
        $response = curl_exec($curl);
        $error = curl_error($curl);
        curl_close($curl);

        $curl = curl_init();

        curl_setopt_array($curl, array(
            CURLOPT_URL => 'https://control.msg91.com/api/v5/flow',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 0,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'POST',
            CURLOPT_POSTFIELDS => json_encode([
                'template_id' => '68664019d6fc05080d67a2a3',
                'short_url' => '0',
                'recipients' => [
                    [
                        'mobiles' => $whatsappNumber,
                        'var1' => $otp
                    ]
                ]
            ]),
            CURLOPT_HTTPHEADER => array(
                'authkey: 458520AbEeXykjU1I3686542daP1',
                'Content-Type: application/json',
                'Accept: application/json'
            ),
        ));

        $response_sms = curl_exec($curl);

        curl_close($curl);

        // Handle response
        if ($error) {
            wp_send_json_error(['message' => 'Error sending OTP.', 'error' => $error]);
        }

        wp_send_json_success(['message' => 'OTP sent successfully!', 'expires_at' => $expires_at, 'status' => 'prod']);
    }

    // wp_send_json_success(['message' => 'OTP sent successfully!', 'data' => json_decode($response, true)]);
}

add_action('wp_ajax_registration_send_otp_whatsapp', 'registration_send_otp_whatsapp');
add_action('wp_ajax_nopriv_registration_send_otp_whatsapp', 'registration_send_otp_whatsapp');

function registration_validate_otp_whatsapp()
{
    $mobile = sanitize_text_field($_POST['mobile']);
    $user_otp = sanitize_text_field($_POST['otp']);

    // Retrieve stored OTP
    $stored_otp_data = get_option('otp_' . $mobile);
    if (!$stored_otp_data) {
        wp_send_json_error(['message' => 'OTP expired or not found.']);
    }

    $otp_data = json_decode($stored_otp_data, true);

    // Check expiration time
    if (time() > $otp_data['expires_at']) {
        delete_option('otp_' . $mobile);
        wp_send_json_error(['message' => 'OTP has expired.']);
    }

    // Validate OTP
    if ($otp_data['otp'] != $user_otp) {
        wp_send_json_error(['message' => 'Invalid OTP.']);
    }

    // OTP is valid, remove it from the database to prevent reuse
    delete_option('otp_' . $mobile);

    wp_send_json_success(['message' => 'OTP verified successfully!']);
}

add_action('wp_ajax_registration_validate_otp_whatsapp', 'registration_validate_otp_whatsapp');
add_action('wp_ajax_nopriv_registration_validate_otp_whatsapp', 'registration_validate_otp_whatsapp');

// Handle form submission

function wp_otp_register_user()
{
    $zoho_crm_mode = true;  // if false then no sync to zoho crm & if true then sync to zoho crm

    $name = sanitize_text_field($_POST['name']);
    $email = sanitize_email($_POST['email']);
    $password = sanitize_text_field('Finno@1234#');
    $mobile = sanitize_text_field($_POST['mobile']);
    $otp = sanitize_text_field($_POST['otp']);
    $drn = sanitize_text_field($_POST['drn']);

    $otp_verified = sanitize_text_field($_POST['otp_verified']);

    $indstate = sanitize_text_field($_POST['indstate']);

    $nameParts = explode(' ', trim($name));  // Split by space and trim extra spaces
    $firstName = $nameParts[0] ?? '';  // First word is first name
    $lastName = count($nameParts) > 1 ? implode(' ', array_slice($nameParts, 1)) : '';

    $userdata = array(
        'user_login' => $email,
        'user_email' => $email,
        'user_pass' => $password,
        'first_name' => $firstName,
        'last_name' => $lastName,  // WordPress default last_name field
        'user_status' => '1'
    );

    $user_id = wp_insert_user($userdata);

    if (!is_wp_error($user_id)) {
        global $wpdb;
        $wpdb->update(
            $wpdb->users,
            array('user_status' => 1),
            array('ID' => $user_id),
            array('%d'),
            array('%d')
        );

        update_user_meta($user_id, 'phone', $mobile);
        update_user_meta($user_id, 'mobile', $mobile);
        update_user_meta($user_id, 'otp_verified', $otp_verified == '1' ? 'Yes' : 'No');
        update_user_meta($user_id, 'indstate', $indstate);
        update_user_meta($user_id, 'drn', $drn);
        update_user_meta($user_id, 'rxconf', $password);

        delete_option('otp_' . $mobile);

        if ($zoho_crm_mode) {
            $utm_source = sanitize_text_field($_POST['utm_source']);
            $utm_medium = sanitize_text_field($_POST['utm_medium']);
            $utm_campaign = sanitize_text_field($_POST['utm_campaign']);
            $utm_term = sanitize_text_field($_POST['utm_term']);
            $utm_content = sanitize_text_field($_POST['utm_content']);

            $profile_data = [
                'name' => $name,
                'FirstName' => $firstName,
                'LastName' => $lastName,
                'email' => $email,
                'phone' => $mobile,
                'utm_source' => $utm_source ?? 'Organic',
                'utm_medium' => $utm_medium ?? 'Website',
                'utm_campaign' => $utm_campaign ?? 'DirectCommunitySignup',
                'utm_term' => $utm_term ?? 'Community',
                'utm_content' => $utm_content ?? 'RxFinnversity',
                'rx_status' => 'Pending',
                'indstate' => $indstate,
                'drn' => $drn
            ];

            addtozohoCrm($profile_data);
        }

        // wp_send_json_success('Registration successful');
        wp_send_json_success([
            'message' => 'Registration successful',
            'user_id' => $user_id,
        ]);
    } else {
        // wp_send_json_error('Registration failed');
        wp_send_json_success([
            'message' => 'Registration failed',
            'user_id' => null,
        ]);
    }
}

add_action('wp_ajax_wp_otp_register_user', 'wp_otp_register_user');
add_action('wp_ajax_nopriv_wp_otp_register_user', 'wp_otp_register_user');

function enqueue_sweetalert()
{
    wp_enqueue_script('sweetalert2', 'https://cdn.jsdelivr.net/npm/sweetalert2@11', array('jquery'), null, true);
}

add_action('wp_enqueue_scripts', 'enqueue_sweetalert');

function addtozohoCrm($profile_data = [])
{
    $postData = array(
        'Name' => $profile_data['name'],
        'FirstName' => $profile_data['FirstName'],
        'LastName' => $profile_data['LastName'],
        'Email' => $profile_data['email'],
        'Phone' => $profile_data['phone'],
        'utm_source' => $profile_data['utm_source'],
        'utm_medium' => $profile_data['utm_medium'],
        'utm_campaign' => $profile_data['utm_campaign'],
        'utm_term' => $profile_data['utm_term'],
        'utm_content' => $profile_data['utm_content'],
        'rx_status' => $profile_data['rx_status'],
        'indstate' => $profile_data['indstate'],
        'drn' => $profile_data['drn']
    );

    $postData = convertIntegersToStrings($postData);

    $url = 'https://flow.zoho.in/60027533273/flow/webhook/incoming?zapikey=1001.5bf9fd857916ed638aa461ab52887239.9c39b8672c731e976175a066ff56acae&isdebug=false';  // debuging url lead crm from rx

    $response = wp_remote_post($url, array(
        'method' => 'POST',
        'body' => json_encode($postData),
        'headers' => array(
            'Content-Type' => 'application/json',
        ),
    ));

    if (is_wp_error($response)) {
        error_log('Zoho API Error: ' . $response->get_error_message());
        return;
    }

    $body = wp_remote_retrieve_body($response);

    error_log('Zoho API Response: ' . $body);

    return json_decode($body, true);
}

function convertIntegersToStrings($data)
{
    foreach ($data as $key => $value) {
        if (is_int($value)) {
            $data[$key] = (string) $value;
        } elseif (is_array($value)) {
            $data[$key] = convertIntegersToStrings($value);
        }
    }

    return $data;
}
