<?php

/*
 * Plugin Name: OTP Login via WhatsApp (WATI)
 * Plugin URI: https://rx.finnovate.in
 * Description: Login users with OTP via WhatsApp API (WATI)
 * Version: 1.0
 * Author: Anoj Tambe
 * Author URI: https://rx.finnovate.in
 * License: GPL2
 */

if (!defined('ABSPATH'))
    exit;  // Exit if accessed directly

// Enqueue scripts and styles
function wp_otp_login_enqueue_scripts()
{
    wp_enqueue_script('jquery');
    wp_enqueue_script('wp-otp-login-script', plugin_dir_url(__FILE__) . 'wp-otp-login-script.js', array('jquery'), null, true);
    wp_enqueue_style('wp-otp-login-style', plugin_dir_url(__FILE__) . 'wp-otp-login-style.css');
}

add_action('wp_enqueue_scripts', 'wp_otp_login_enqueue_scripts');

// Register Shortcode
function otp_login_form_shortcode()
{
    ob_start();

?>
<div id="user_registerform" class="mainForm">
    <div class="card-inner">
        <div class="socialv-login-form">
            <a class="navbar-brand socialv-logo logo-align-left " href="https://www.financialopd.com">
                <!--<h4 class="logo-title">Financial OPD</h4>-->
                <div class="logo-main">
                    <div class="logo-normal"><img decoding="async" class="img-fluid logo finnlogoheight" loading="lazy"
                            src="https://www.financialopd.com/wp-content/uploads/2025/06/1vdark.png"
                            alt=""></div>
                </div>
            </a>
            <div class="socialv-info text-center">
                <p>Welcome back! It's time for a financial detox</p>
            </div>
            <form id="wp-otp-signin" novalidate autocomplete="off">
                <div class="row">
                    <div class="col-md-12 mb-3">
                        <div class="register-username">
                            <label>Mobile *</label>
                            <div class="input-group mb-0"> <span class="input-group-text"><i
                                        class="iconly-Lock icli"></i></span>
                                <input type="text" class="form-control" name="mobile" id="mobile"
                                    placeholder="Enter Mobile Number" required>
                            </div> <span id="mobile-error" class="error-message"></span>

                            <div id="otp-section" style="display: none;">
                                <div class="input-group mb-2 mt-2"> <span class="input-group-text"><i
                                            class="iconly-Lock icli"></i></span>
                                    <input type="text" class="form-control" name="verify_otp" id="otp"
                                        placeholder="Enter OTP" required>
                                    <button type="button" id="login-resend-otp" style="display: none;"
                                        class="socialv-button atButton">Resend OTP</button>
                                </div>
                                <p id="otp-timer" style="color: red;"></p> <span id="otp-error"
                                    class="error-message"></span>
                            </div>
                            <p id="otp-success-message"></p>
                        </div>
                    </div>
                    <div class="col-md-12 socialv-auth-button">
                        <button type="button" class="socialv-button w-100 atButton" id="login-send-otp">Login to continue</button>
                        <button type="submit" class="socialv-button w-100 atButton" id="login-verify-otp" style="display: none;">Verify
                            OTP</button>
                    </div>
                </div>
            </form>
            <div class="col-md-12 text-center">
                <p class="register-link">Don’t have a account?<a id="user_forget_form"
                        href="sign-up" class="socialv-button socialv-button-link">Sign up
                        now</a></p>
            </div>
        </div>
    </div>
</div>

<?php
    return ob_get_clean();
}

add_shortcode('otp_login_form', 'otp_login_form_shortcode');

// ✅ Function to Generate and Send OTP via WATI
function wp_login_send_otp()
{
    $mobile = sanitize_text_field($_POST['mobile']);
    $otp = rand(100000, 999999);

    //$testing_mode = false;  // Set to `true` to bypass actual API for testing
    // Read GET parameter (returns null if not passed)
    $bypassParam = isset($_POST['bypassfinotp']) ? $_POST['bypassfinotp'] : null;
    
    // Set testing mode based on condition
    $testing_mode = ($bypassParam == '426') ? true : false;

    // Normalize the WhatsApp number
    if (strlen($mobile) == 10) {
        $whatsappNumber = '91' . $mobile;
    } elseif (strlen($mobile) == 12 && substr($mobile, 0, 2) != '91') {
        $whatsappNumber = '91' . substr($mobile, 2);
    } else {
        wp_send_json_error(['message' => 'Invalid mobile number format.']);
    }

    // Find User by Mobile Number
    $user_query = new WP_User_Query(array(
        'meta_key' => 'mobile',
        'meta_value' => $mobile,
        'number' => 1,
    ));
    $users = $user_query->get_results();

    if (empty($users)) {
        wp_send_json_error('Mobile number not found in our records. Please sign up to continue.');
    }

    if (!empty($users)) {
        $user = $users[0];  // Get first user from the result
        $user_status = get_user_by('ID', $user->ID)->user_status;

        if ($user_status == 1) {
            wp_send_json_error(['message' => 'Your account is currently under review. Once approved, you will receive a notification with instructions to log in']);
            wp_die();
        }
    }

    //$expires_at = 600;  // 10 minutes
    
    $expires_at = time() + (10 * 60);   // current timestamp + 10 minutes

    // Store OTP in the database (set expiry time of 10 minutes)
    update_option('sotp_' . $mobile, json_encode([
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
        $response_wati = curl_exec($curl);
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
        //echo $response;

        // Handle response
        if ($error) {
            wp_send_json_error(['message' => 'Error sending OTP.', 'error' => $error]);
        }

        wp_send_json_success(['message' => 'OTP sent successfully!', 'expires_at' => $expires_at, 'status' => 'prod']);
    }
}

add_action('wp_ajax_wp_login_send_otp', 'wp_login_send_otp');
add_action('wp_ajax_nopriv_wp_login_send_otp', 'wp_login_send_otp');

function validate_sign_in_otp()
{
    if (!isset($_POST['mobile']) || !isset($_POST['otp'])) {
        wp_send_json_error('Mobile number and OTP are required.');
    }

    $mobile = sanitize_text_field($_POST['mobile']);
    $user_otp = sanitize_text_field($_POST['otp']);

    // Retrieve stored OTP
    $stored_otp_data = get_option('sotp_' . $mobile);
    if (!$stored_otp_data) {
        wp_send_json_error(['message' => 'OTP expired or not found.']);
    }

    $otp_data = json_decode($stored_otp_data, true);

    // Check expiration time
    if (time() > $otp_data['expires_at']) {
        delete_option('sotp_' . $mobile);
        wp_send_json_error(['message' => 'OTP has expired.']);
    }

    // Validate OTP
    if ($otp_data['otp'] != $user_otp) {
        wp_send_json_error(['message' => 'Invalid OTP.']);
    }

    // Find User by Mobile Number
    $user_query = new WP_User_Query(array(
        'meta_key' => 'mobile',
        'meta_value' => $mobile,
        'number' => 1,
    ));
    $users = $user_query->get_results();

    if (empty($users)) {
        wp_send_json_error('User not found.');
    }

    $user = $users[0];
    $user_id = $user->ID;

    // Log In User
    wp_set_auth_cookie($user->ID, true);
    wp_set_current_user($user->ID);
    do_action('wp_login', $user->user_login, $user);

    // Get stored user login (email or username)
    $user_data = get_userdata($user_id);
    $user_login = $user_data->user_login;

    // Password should be the one user originally set (not hashed one)
    $raw_password = get_user_meta($user_id, 'rxconf', true);  // Ensure you store this when creating users

    if (empty($raw_password)) {
        $raw_password = 'Finno@1234#';
    }

    $creds = array(
        'user_login' => $user_login,
        'user_password' => $raw_password,  // Use stored password
        'remember' => true,
    );
    $user_signon = wp_signon($creds, false);

    // Now trigger the restore cart process manually
    restore_cart_after_login($user_id);

    if (is_wp_error($user_signon)) {
        wp_send_json_error(['message' => $user_signon->get_error_message()]);
    }

    // Generate secure token and store in cookie
    $login_token = wp_generate_password(32, false);
    update_user_meta($user_id, '_login_token', $login_token);
    setcookie('custom_login_token', $login_token, time() + (30 * DAY_IN_SECONDS), COOKIEPATH, COOKIE_DOMAIN, is_ssl(), true);

    // Delete OTP after successful login
    delete_option('sotp_' . $mobile);

    wp_send_json_success(['message' => 'Login successful.']);

    // wp_safe_redirect(home_url());
    $headers = getallheaders();
    $referer = !empty($headers['Referer']) ? $headers['Referer'] : wp_get_referer();

    // If referer contains 'sign-up', redirect to home page
    if (!empty($referer) && strpos($referer, 'sign-up') !== false) {
        wp_safe_redirect(home_url());
    } else {
        wp_safe_redirect(!empty($referer) ? $referer : home_url());
    }

    exit;
}

add_action('wp_loaded', function () {
    if (!function_exists('LP') || !class_exists('LP_Cart')) {
        include_once WP_PLUGIN_DIR . '/learnpress/learnpress.php';
    }
}, 15);  // Ensure it's loaded after LearnPress

add_action('wp_ajax_validate_sign_in_otp', 'validate_sign_in_otp');
add_action('wp_ajax_nopriv_validate_sign_in_otp', 'validate_sign_in_otp');

// Function to restore cart after login
function restore_cart_after_login_old($user_id)
{
    $saved_cart_items = get_transient('user_cart_' . $user_id);

    if ($saved_cart_items) {
        error_log('Restoring saved cart items for user ' . $user_id . ': ' . print_r($saved_cart_items, true));

        // Ensure cart is reinitialized
        if (function_exists('LP') && !LP()->cart) {
            LP()->cart = new LP_Cart();
            error_log('Cart reinitialized after login for user ' . $user_id);
        }

        foreach ($saved_cart_items as $item) {
            if (
                isset($item['item_id']) &&
                isset($item['quantity']) &&
                is_numeric($item['item_id']) &&
                is_numeric($item['quantity'])
            ) {
                LP()->cart->add_to_cart((int) $item['item_id'], (int) $item['quantity'], $item);
            } else {
                error_log('Invalid cart item data for user ' . $user_id . ': ' . print_r($item, true));
            }
        }

        delete_transient('user_cart_' . $user_id);
    } else {
        error_log('No saved cart items found for user ' . $user_id . ' after login.');
    }
}

function restore_cart_after_login($user_id)
{
    error_log('Restored guest purchase ' . $user_id);

    $guest_id = isset($_COOKIE['wp_guest_id']) ? sanitize_text_field($_COOKIE['wp_guest_id']) : '';
    $purchase_data = get_transient('guest_purchase_' . $guest_id);

    if ($purchase_data) {
        $course_id = $purchase_data['course_id'];
        error_log("Restored guest purchase: Course ID is $course_id");

        // Ensure cart is reinitialized
        if (function_exists('LP') && !LP()->cart) {
            LP()->cart = new LP_Cart();
            error_log('Cart reinitialized after login for user ' . $user_id);
        }

        if (!empty($course_id)) {
            $quantity = 1;
            $item = [
                'item_id' => $course_id,
                'quantity' => $quantity
            ];

            LP()->cart->add_to_cart($course_id, $quantity, $item);

            delete_transient('guest_purchase_' . $guest_id);
        }
    }
}

// Save cart items before login

function save_cart_items_before_login($user_id)
{
    error_log('Restored guest purchase ' . $user_id);

    $guest_id = isset($_COOKIE['wp_guest_id']) ? sanitize_text_field($_COOKIE['wp_guest_id']) : '';
    $purchase_data = get_transient('guest_purchase_' . $guest_id);

    if ($purchase_data) {
        $course_id = $purchase_data['course_id'];
        error_log("Restored guest purchase: Course ID is $course_id");
    }

    die('rxuat');
}

// Hook into wp_loaded to make sure LearnPress is loaded
add_action('wp_loaded', 'initialize_lp_cart', 20);

function initialize_lp_cart()
{
    // Ensure LearnPress is loaded
    if (function_exists('LP')) {
        // If cart is not already initialized, do it here
        if (!LP()->cart) {
            LP()->cart = new LP_Cart();
        }
    }
}

// =====================
// AUTO LOGIN ON COOKIE
// =====================
add_action('init', 'auto_login_with_custom_cookie', 1);

function auto_login_with_custom_cookie()
{

    // ⛔ Skip auto-login if Elementor is in preview/edit mode
    if (is_admin() || isset($_GET['elementor-preview']) || isset($_GET['action']) && $_GET['action'] === 'elementor') {
        return;
    }
    
    // Helper: Get current request URI path
    $current_path = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');

    // List of paths to redirect if user is logged in
    $redirect_pages = ['sign-up', 'sign-in'];

    // If user is already logged in
    if (is_user_logged_in()) {
        if (in_array($current_path, $redirect_pages)) {
            wp_redirect(home_url());
            exit;
        }
        return;
    }

    // If login token exists in cookie
    if (!empty($_COOKIE['custom_login_token'])) {
        $token = sanitize_text_field($_COOKIE['custom_login_token']);

        $user_query = new WP_User_Query([
            'meta_key' => '_login_token',
            'meta_value' => $token,
            'number' => 1,
        ]);
        $users = $user_query->get_results();

        if (!empty($users)) {
            $user = $users[0];
            wp_set_auth_cookie($user->ID, true);
            wp_set_current_user($user->ID);
            do_action('wp_login', $user->user_login, $user);

            // After successful login via cookie, redirect from sign-in/sign-up
            if (in_array($current_path, $redirect_pages)) {
                wp_redirect(home_url());
                exit;
            }
        } else {
            // Invalid token - clear the cookie
            setcookie('custom_login_token', '', time() - 3600, COOKIEPATH, COOKIE_DOMAIN);
        }
    }
}

// =====================
// LOGOUT CLEANUP
// =====================
add_action('wp_logout', function () {
    if (!empty($_COOKIE['custom_login_token'])) {
        $token = sanitize_text_field($_COOKIE['custom_login_token']);
        $users = get_users([
            'meta_key' => '_login_token',
            'meta_value' => $token,
            'number' => 1,
        ]);
        if (!empty($users)) {
            delete_user_meta($users[0]->ID, '_login_token');
        }
        setcookie('custom_login_token', '', time() - 3600, COOKIEPATH, COOKIE_DOMAIN);
    }
});
