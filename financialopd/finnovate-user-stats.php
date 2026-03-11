<?php
/**
 * Plugin Name: Finnovate User Stats
 * Description: Custom user activity stats dashboard with clickable cards, filters, search, sortable table, graphs, and CSV export.
 * Version: 4.1.0
 * Author: Finnovate
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// ─────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────
define( 'FUS_VERIFIED_META_KEY',   'bp_verified_member' );
define( 'FUS_VERIFIED_META_VALUE', '1' );
define( 'FUS_LOGIN_COUNT_META',    'fus_login_count' );
define( 'FUS_MOBILE_META',         'mobile' );
define( 'FUS_STATE_META',          'indstate' );
define( 'FUS_DRN_META',            'drn' );
define( 'FUS_SEGMENT_OVERRIDE_META', 'fus_account_segment_override' );
define( 'FUS_ZOHO_OAUTH_OPTION',   'fus_zoho_oauth_settings' );
define( 'FUS_ZOHO_STATUS_META',    'fus_zoho_status' );
define( 'FUS_ZOHO_STATUS_MSG_META','fus_zoho_status_message' );
define( 'FUS_ZOHO_STATUS_AT_META', 'fus_zoho_status_checked_at' );
define( 'FUS_ZOHO_LAST_SYNC_AT_OPTION', 'fus_zoho_last_sync_at' );
define( 'FUS_ZOHO_ORIGIN_META',    'fus_zoho_origin' );
define( 'FUS_ZOHO_LEAD_SOURCE_META', 'fus_zoho_lead_source' );
define( 'FUS_ZOHO_BRANCH_META',    'fus_zoho_branch' );
define( 'FUS_ZOHO_CAMPAIGN_META',  'fus_zoho_campaign' );
define( 'FUS_ZOHO_MEDIUM_META',    'fus_zoho_medium' );
define( 'FUS_ZOHO_TERM_META',      'fus_zoho_term' );
define( 'FUS_ZOHO_CTA_META',       'fus_zoho_cta' );
define( 'FUS_ZOHO_LEAD_OWNER_META','fus_zoho_lead_owner' );
define( 'FUS_ZOHO_MEETINGS_META',  'fus_zoho_total_meetings' );
define( 'FUS_ZOHO_OPPORTUNITIES_META', 'fus_zoho_total_opportunities' );
define( 'FUS_ZOHO_LAST_ACTIVITY_META', 'fus_zoho_last_activity' );
define( 'FUS_WSAL_IMPORT_STATE_OPTION', 'fus_wsal_import_state' );

// ─────────────────────────────────────────────────────────────────
// HELPERS: account classification
// ─────────────────────────────────────────────────────────────────
function fus_is_internal_sql( $alias = 'u' ) {
    global $wpdb;
    return $wpdb->prepare( "{$alias}.user_email LIKE %s", '%finnovate%' );
}

function fus_is_testing_sql( $alias = 'u' ) {
    global $wpdb;
    return $wpdb->prepare(
        "( ( {$alias}.user_email LIKE %s AND ( {$alias}.user_login LIKE %s OR {$alias}.display_name LIKE %s OR {$alias}.user_login LIKE %s OR {$alias}.display_name LIKE %s ) ) OR {$alias}.user_email LIKE %s )",
        '%finnovate%', '%test%', '%test%', '%pranob%', '%pranob%', '%+%'
    );
}

function fus_is_prod_user_where_sql( $alias = 'u' ) {
    $internal = fus_is_internal_sql( $alias );
    $testing  = fus_is_testing_sql( $alias );
    return "( NOT ( {$internal} ) AND NOT ( {$testing} ) )";
}

function fus_segment_override_values() {
    return array( 'testing', 'internal', 'registered', 'pending' );
}

function fus_get_effective_segment_case_sql( $alias = 'u' ) {
    global $wpdb;

    $allowed_overrides = "'" . implode( "','", array_map( 'esc_sql', fus_segment_override_values() ) ) . "'";
    $override_subquery = $wpdb->prepare(
        "(SELECT umov.meta_value FROM {$wpdb->usermeta} umov WHERE umov.user_id = {$alias}.ID AND umov.meta_key = %s LIMIT 1)",
        FUS_SEGMENT_OVERRIDE_META
    );
    $has_verified_sql = $wpdb->prepare(
        "EXISTS (SELECT 1 FROM {$wpdb->usermeta} umv WHERE umv.user_id = {$alias}.ID AND umv.meta_key = %s AND umv.meta_value = %s)",
        FUS_VERIFIED_META_KEY,
        FUS_VERIFIED_META_VALUE
    );
    $legacy_internal = fus_is_internal_sql( $alias );
    $legacy_testing  = fus_is_testing_sql( $alias );
    $legacy_prod     = fus_is_prod_user_where_sql( $alias );

    return "CASE
        WHEN {$override_subquery} IN ({$allowed_overrides}) THEN {$override_subquery}
        WHEN {$alias}.user_registered = '0000-00-00 00:00:00' THEN 'uploaded'
        WHEN {$legacy_testing} THEN 'testing'
        WHEN {$legacy_internal} THEN 'internal'
        WHEN {$alias}.user_registered != '0000-00-00 00:00:00' AND {$legacy_prod} AND {$has_verified_sql} THEN 'approved'
        WHEN {$alias}.user_registered != '0000-00-00 00:00:00' AND {$legacy_prod} THEN 'pending'
        ELSE 'total'
    END";
}

function fus_is_segment_effective_where_sql( $segment, $alias = 'u' ) {
    global $wpdb;

    $override_subquery = $wpdb->prepare(
        "(SELECT umov.meta_value FROM {$wpdb->usermeta} umov WHERE umov.user_id = {$alias}.ID AND umov.meta_key = %s LIMIT 1)",
        FUS_SEGMENT_OVERRIDE_META
    );
    $allowed_overrides = "'" . implode( "','", array_map( 'esc_sql', fus_segment_override_values() ) ) . "'";
    $no_override_sql   = "( {$override_subquery} IS NULL OR {$override_subquery} = '' OR {$override_subquery} NOT IN ({$allowed_overrides}) )";
    $legacy_internal   = fus_is_internal_sql( $alias );
    $legacy_testing    = fus_is_testing_sql( $alias );
    $legacy_prod       = fus_is_prod_user_where_sql( $alias );
    $is_verified_sql   = $wpdb->prepare(
        "EXISTS (SELECT 1 FROM {$wpdb->usermeta} umv WHERE umv.user_id = {$alias}.ID AND umv.meta_key = %s AND umv.meta_value = %s)",
        FUS_VERIFIED_META_KEY,
        FUS_VERIFIED_META_VALUE
    );
    $is_not_verified_sql = $wpdb->prepare(
        "NOT EXISTS (SELECT 1 FROM {$wpdb->usermeta} umv WHERE umv.user_id = {$alias}.ID AND umv.meta_key = %s AND umv.meta_value = %s)",
        FUS_VERIFIED_META_KEY,
        FUS_VERIFIED_META_VALUE
    );

    if ( $segment === 'testing' ) {
        return "( {$override_subquery} = 'testing' OR ( {$no_override_sql} AND {$legacy_testing} ) )";
    }
    if ( $segment === 'internal' ) {
        return "( {$override_subquery} = 'internal' OR ( {$no_override_sql} AND {$legacy_internal} ) )";
    }
    if ( $segment === 'uploaded' ) {
        return "( {$no_override_sql} AND {$alias}.user_registered = '0000-00-00 00:00:00' )";
    }
    if ( $segment === 'registered' ) {
        return "(
            {$override_subquery} = 'registered'
            OR (
                {$no_override_sql}
                AND {$alias}.user_registered != '0000-00-00 00:00:00'
                AND {$legacy_prod}
            )
        )";
    }
    if ( $segment === 'approved' ) {
        return "(
            (
                {$override_subquery} = 'registered'
                OR (
                    {$no_override_sql}
                    AND {$alias}.user_registered != '0000-00-00 00:00:00'
                    AND {$legacy_prod}
                )
            )
            AND {$is_verified_sql}
        )";
    }
    if ( $segment === 'pending' ) {
        return "(
            {$override_subquery} = 'pending'
            OR (
                (
                    {$override_subquery} = 'registered'
                    OR (
                        {$no_override_sql}
                        AND {$alias}.user_registered != '0000-00-00 00:00:00'
                        AND {$legacy_prod}
                    )
                )
                AND {$is_not_verified_sql}
            )
        )";
    }

    return '1=1';
}

function fus_is_user_verified( $user_id ) {
    return (string) get_user_meta( $user_id, FUS_VERIFIED_META_KEY, true ) === FUS_VERIFIED_META_VALUE;
}

function fus_get_user_segment_override( $user_id ) {
    $override = sanitize_key( (string) get_user_meta( $user_id, FUS_SEGMENT_OVERRIDE_META, true ) );
    return in_array( $override, fus_segment_override_values(), true ) ? $override : '';
}

function fus_is_user_internal_legacy( $user ) {
    $email = isset( $user->user_email ) ? strtolower( (string) $user->user_email ) : '';
    return ( strpos( $email, 'finnovate' ) !== false );
}

function fus_is_user_testing_legacy( $user ) {
    $email = isset( $user->user_email ) ? strtolower( (string) $user->user_email ) : '';
    $login = isset( $user->user_login ) ? strtolower( (string) $user->user_login ) : '';
    $name  = isset( $user->display_name ) ? strtolower( (string) $user->display_name ) : '';
    if ( strpos( $email, '+' ) !== false ) return true;
    if ( strpos( $email, 'finnovate' ) === false ) return false;
    return (
        strpos( $login, 'test' ) !== false ||
        strpos( $name, 'test' ) !== false ||
        strpos( $login, 'pranob' ) !== false ||
        strpos( $name, 'pranob' ) !== false
    );
}

function fus_user_matches_segment( $user_id, $segment ) {
    if ( $segment === 'total' ) return true;

    $user = get_userdata( (int) $user_id );
    if ( ! $user ) return false;

    $override = fus_get_user_segment_override( $user_id );
    $is_verified = fus_is_user_verified( $user_id );
    $registered_zero = ( isset( $user->user_registered ) && $user->user_registered === '0000-00-00 00:00:00' );

    if ( $override ) {
        if ( $segment === $override ) return true;
        if ( $override === 'registered' && $segment === 'approved' && $is_verified ) return true;
        if ( $override === 'registered' && $segment === 'pending' && ! $is_verified ) return true;
        if ( $override === 'registered' && $segment === 'registered' ) return true;
        return false;
    }

    if ( $registered_zero ) {
        return $segment === 'uploaded';
    }

    if ( fus_is_user_testing_legacy( $user ) ) {
        return $segment === 'testing';
    }
    if ( fus_is_user_internal_legacy( $user ) ) {
        return $segment === 'internal';
    }

    if ( $segment === 'registered' ) return true;
    if ( $segment === 'approved' ) return $is_verified;
    if ( $segment === 'pending' ) return ! $is_verified;
    return false;
}

// ─────────────────────────────────────────────────────────────────
// HELPERS: Zoho OAuth settings
// ─────────────────────────────────────────────────────────────────
function fus_get_zoho_oauth_settings() {
    $defaults = array(
        'accounts_url'      => 'https://accounts.zoho.com',
        'api_domain'        => '',
        'client_id'         => '',
        'client_secret'     => '',
        'refresh_token'     => '',
        'access_token'      => '',
        'expires_in'        => 0,
        'expires_at'        => 0,
        'last_refreshed_at' => 0,
        'last_error'        => '',
    );
    $stored = get_option( FUS_ZOHO_OAUTH_OPTION, array() );
    if ( ! is_array( $stored ) ) $stored = array();
    return array_merge( $defaults, $stored );
}

function fus_save_zoho_oauth_settings( $settings ) {
    update_option( FUS_ZOHO_OAUTH_OPTION, $settings, false );
}

function fus_sanitize_zoho_accounts_url( $url ) {
    $url = trim( (string) $url );
    if ( $url === '' ) return 'https://accounts.zoho.com';
    if ( stripos( $url, 'http://' ) !== 0 && stripos( $url, 'https://' ) !== 0 ) {
        $url = 'https://' . ltrim( $url, '/' );
    }
    $url = esc_url_raw( $url );
    return rtrim( $url, '/' );
}

function fus_refresh_zoho_access_token() {
    $settings = fus_get_zoho_oauth_settings();
    $accounts_url = fus_sanitize_zoho_accounts_url( $settings['accounts_url'] );
    $client_id = trim( (string) $settings['client_id'] );
    $client_secret = trim( (string) $settings['client_secret'] );
    $refresh_token = trim( (string) $settings['refresh_token'] );

    if ( $client_id === '' || $client_secret === '' || $refresh_token === '' ) {
        return array( 'ok' => false, 'message' => 'Client ID, Client Secret, and Refresh Token are required.' );
    }

    $endpoint = $accounts_url . '/oauth/v2/token';
    $response = wp_remote_post( $endpoint, array(
        'timeout' => 20,
        'body'    => array(
            'refresh_token' => $refresh_token,
            'client_id'     => $client_id,
            'client_secret' => $client_secret,
            'grant_type'    => 'refresh_token',
        ),
    ) );

    if ( is_wp_error( $response ) ) {
        $settings['last_error'] = $response->get_error_message();
        fus_save_zoho_oauth_settings( $settings );
        return array( 'ok' => false, 'message' => $settings['last_error'] );
    }

    $code = (int) wp_remote_retrieve_response_code( $response );
    $body = (string) wp_remote_retrieve_body( $response );
    $json = json_decode( $body, true );
    if ( ! is_array( $json ) ) $json = array();

    if ( $code < 200 || $code >= 300 || empty( $json['access_token'] ) ) {
        $msg = '';
        if ( ! empty( $json['error'] ) ) {
            $msg = (string) $json['error'];
            if ( ! empty( $json['error_description'] ) ) {
                $msg .= ': ' . (string) $json['error_description'];
            }
        } else {
            $msg = 'Token request failed (HTTP ' . $code . ').';
        }
        $settings['last_error'] = $msg;
        fus_save_zoho_oauth_settings( $settings );
        return array( 'ok' => false, 'message' => $msg );
    }

    $expires_in = isset( $json['expires_in_sec'] ) ? (int) $json['expires_in_sec'] : ( isset( $json['expires_in'] ) ? (int) $json['expires_in'] : 3600 );
    $settings['accounts_url'] = $accounts_url;
    $settings['access_token'] = (string) $json['access_token'];
    $settings['api_domain'] = isset( $json['api_domain'] ) ? sanitize_text_field( (string) $json['api_domain'] ) : (string) $settings['api_domain'];
    $settings['expires_in'] = $expires_in;
    $settings['expires_at'] = time() + max( 0, $expires_in );
    $settings['last_refreshed_at'] = time();
    $settings['last_error'] = '';
    fus_save_zoho_oauth_settings( $settings );

    return array( 'ok' => true, 'message' => 'Access token generated successfully.' );
}

function fus_zoho_get_valid_access_token() {
    $settings = fus_get_zoho_oauth_settings();
    $access_token = trim( (string) $settings['access_token'] );
    $expires_at = (int) $settings['expires_at'];
    if ( $access_token !== '' && $expires_at > ( time() + 60 ) ) {
        return array(
            'ok' => true,
            'access_token' => $access_token,
            'api_domain' => trim( (string) $settings['api_domain'] ),
            'accounts_url' => trim( (string) $settings['accounts_url'] ),
        );
    }

    $refreshed = fus_refresh_zoho_access_token();
    if ( empty( $refreshed['ok'] ) ) return array( 'ok' => false, 'message' => (string) $refreshed['message'] );

    $settings = fus_get_zoho_oauth_settings();
    return array(
        'ok' => true,
        'access_token' => trim( (string) $settings['access_token'] ),
        'api_domain' => trim( (string) $settings['api_domain'] ),
        'accounts_url' => trim( (string) $settings['accounts_url'] ),
    );
}

function fus_zoho_pick_api_domain( $settings ) {
    $api_domain = trim( (string) $settings['api_domain'] );
    if ( $api_domain !== '' ) return rtrim( $api_domain, '/' );

    $accounts_url = fus_sanitize_zoho_accounts_url( isset( $settings['accounts_url'] ) ? $settings['accounts_url'] : '' );
    $host = (string) wp_parse_url( $accounts_url, PHP_URL_HOST );
    $map = array(
        'accounts.zoho.in'  => 'https://www.zohoapis.in',
        'accounts.zoho.eu'  => 'https://www.zohoapis.eu',
        'accounts.zoho.com.au' => 'https://www.zohoapis.com.au',
        'accounts.zoho.jp'  => 'https://www.zohoapis.jp',
        'accounts.zohocloud.ca' => 'https://www.zohoapis.ca',
    );
    if ( isset( $map[ strtolower( $host ) ] ) ) return $map[ strtolower( $host ) ];
    return 'https://www.zohoapis.com';
}

function fus_zoho_search_module( $module, $email, $mobile ) {
    $token_data = fus_zoho_get_valid_access_token();
    if ( empty( $token_data['ok'] ) ) return array( 'ok' => false, 'message' => (string) $token_data['message'], 'records' => array() );

    $api_domain = fus_zoho_pick_api_domain( $token_data );
    $endpoint = rtrim( $api_domain, '/' ) . '/crm/v2/' . rawurlencode( $module ) . '/search';

    $parts = array();
    $email = trim( (string) $email );
    $mobile = trim( (string) $mobile );
    if ( $email !== '' ) $parts[] = '(Email:equals:' . str_replace( array( '(', ')', ',' ), '', $email ) . ')';
    if ( $mobile !== '' ) {
        $parts[] = '(Mobile:equals:' . str_replace( array( '(', ')', ',' ), '', $mobile ) . ')';
        $parts[] = '(Phone:equals:' . str_replace( array( '(', ')', ',' ), '', $mobile ) . ')';
    }
    if ( empty( $parts ) ) return array( 'ok' => true, 'records' => array() );

    $do_search = function( $criteria ) use ( $endpoint, $token_data ) {
        $http_timeout = (int) apply_filters( 'fus_zoho_http_timeout', 8 );
        if ( $http_timeout < 3 ) $http_timeout = 3;
        $url = add_query_arg( array( 'criteria' => $criteria, 'per_page' => 2 ), $endpoint );
        $res = wp_remote_get( $url, array(
            'timeout' => $http_timeout,
            'headers' => array(
                'Authorization' => 'Zoho-oauthtoken ' . $token_data['access_token'],
            ),
        ) );

        if ( is_wp_error( $res ) ) {
            return array(
                'ok' => false,
                'records' => array(),
                'error_code' => '',
                'message' => $res->get_error_message(),
            );
        }

        $code = (int) wp_remote_retrieve_response_code( $res );
        $body = (string) wp_remote_retrieve_body( $res );
        $json = json_decode( $body, true );
        if ( ! is_array( $json ) ) $json = array();

        if ( $code >= 200 && $code < 300 ) {
            $records = ( isset( $json['data'] ) && is_array( $json['data'] ) ) ? $json['data'] : array();
            return array(
                'ok' => true,
                'records' => $records,
                'error_code' => '',
                'message' => '',
            );
        }

        $message = 'Zoho API request failed (HTTP ' . $code . ').';
        if ( ! empty( $json['message'] ) ) $message = (string) $json['message'];
        $error_code = ! empty( $json['code'] ) ? (string) $json['code'] : '';
        if ( $error_code !== '' ) $message = $error_code . ': ' . $message;
        return array(
            'ok' => false,
            'records' => array(),
            'error_code' => $error_code,
            'message' => $message,
        );
    };

    $criteria = ( count( $parts ) === 1 ) ? $parts[0] : '(' . implode( 'or', $parts ) . ')';
    $combined = $do_search( $criteria );
    if ( $combined['ok'] ) {
        return array( 'ok' => true, 'records' => $combined['records'] );
    }

    // Some Zoho setups reject combined OR criteria; retry per field before failing.
    if ( $combined['error_code'] !== 'INVALID_QUERY' || count( $parts ) <= 1 ) {
        return array( 'ok' => false, 'message' => (string) $combined['message'], 'records' => array() );
    }

    $fatal_message = '';
    foreach ( $parts as $part ) {
        $single = $do_search( $part );
        if ( $single['ok'] ) {
            if ( ! empty( $single['records'] ) ) {
                return array( 'ok' => true, 'records' => $single['records'] );
            }
            continue;
        }
        if ( ! in_array( $single['error_code'], array( 'INVALID_QUERY', 'INVALID_DATA' ), true ) ) {
            $fatal_message = (string) $single['message'];
            break;
        }
    }

    if ( $fatal_message !== '' ) {
        return array( 'ok' => false, 'message' => $fatal_message, 'records' => array() );
    }

    return array( 'ok' => true, 'records' => array() );
}

function fus_zoho_get_record_by_id( $module, $record_id, $fields = array() ) {
    $module = fus_zoho_sanitize_module( $module );
    $record_id = trim( (string) $record_id );
    if ( $record_id === '' ) return array( 'ok' => false, 'message' => 'Missing record id.', 'record' => array() );

    $token_data = fus_zoho_get_valid_access_token();
    if ( empty( $token_data['ok'] ) ) {
        return array( 'ok' => false, 'message' => (string) $token_data['message'], 'record' => array() );
    }

    $api_domain = fus_zoho_pick_api_domain( $token_data );
    $url = rtrim( $api_domain, '/' ) . '/crm/v2/' . rawurlencode( $module ) . '/' . rawurlencode( $record_id );
    $field_list = array();
    if ( is_array( $fields ) ) {
        foreach ( $fields as $f ) {
            $f = trim( (string) $f );
            if ( $f !== '' ) $field_list[] = $f;
        }
    }
    if ( ! empty( $field_list ) ) {
        $url = add_query_arg( array( 'fields' => implode( ',', array_unique( $field_list ) ) ), $url );
    }
    $http_timeout = (int) apply_filters( 'fus_zoho_http_timeout', 8 );
    if ( $http_timeout < 3 ) $http_timeout = 3;
    $res = wp_remote_get( $url, array(
        'timeout' => $http_timeout,
        'headers' => array(
            'Authorization' => 'Zoho-oauthtoken ' . $token_data['access_token'],
        ),
    ) );
    if ( is_wp_error( $res ) ) {
        return array( 'ok' => false, 'message' => $res->get_error_message(), 'record' => array() );
    }

    $code = (int) wp_remote_retrieve_response_code( $res );
    $body = (string) wp_remote_retrieve_body( $res );
    $json = json_decode( $body, true );
    if ( ! is_array( $json ) ) $json = array();
    if ( $code < 200 || $code >= 300 ) {
        $msg = ! empty( $json['message'] ) ? (string) $json['message'] : ( 'Zoho API request failed (HTTP ' . $code . ').' );
        return array( 'ok' => false, 'message' => $msg, 'record' => array() );
    }
    $records = ( isset( $json['data'] ) && is_array( $json['data'] ) ) ? $json['data'] : array();
    $record = ( ! empty( $records ) && is_array( $records[0] ) ) ? $records[0] : array();
    return array( 'ok' => true, 'message' => '', 'record' => $record );
}

function fus_zoho_classify_member( $email, $mobile ) {
    $email = sanitize_email( (string) $email );
    $mobile = sanitize_text_field( (string) $mobile );
    if ( $email === '' && $mobile === '' ) {
        return array( 'ok' => false, 'type' => 'unknown', 'module' => '', 'message' => 'No email/mobile available.' );
    }

    $contacts = fus_zoho_search_module( 'Contacts', $email, $mobile );
    if ( ! $contacts['ok'] ) return array( 'ok' => false, 'type' => 'unknown', 'module' => '', 'message' => $contacts['message'] );
    if ( ! empty( $contacts['records'] ) ) return array( 'ok' => true, 'type' => 'client', 'module' => 'Contacts', 'message' => 'Matched in Contacts.' );

    $leads = fus_zoho_search_module( 'Leads', $email, $mobile );
    if ( ! $leads['ok'] ) return array( 'ok' => false, 'type' => 'unknown', 'module' => '', 'message' => $leads['message'] );
    if ( ! empty( $leads['records'] ) ) return array( 'ok' => true, 'type' => 'lead', 'module' => 'Leads', 'message' => 'Matched in Leads.' );

    return array( 'ok' => true, 'type' => 'not_found', 'module' => '', 'message' => 'No Zoho match found.' );
}

function fus_zoho_allowed_modules() {
    return array( 'Leads', 'Contacts' );
}

function fus_zoho_sanitize_module( $module ) {
    $module = trim( (string) $module );
    return in_array( $module, fus_zoho_allowed_modules(), true ) ? $module : 'Leads';
}

function fus_zoho_value_from_record( $record, $keys, $default = '' ) {
    $extract_scalar = static function( $value ) use ( $default ) {
        if ( is_scalar( $value ) ) return (string) $value;
        if ( is_array( $value ) ) {
            foreach ( array( 'name', 'display_value', 'value', 'label', 'text', 'Name' ) as $k ) {
                if ( isset( $value[ $k ] ) && is_scalar( $value[ $k ] ) && $value[ $k ] !== '' ) {
                    return (string) $value[ $k ];
                }
            }
        }
        return $default;
    };
    if ( ! is_array( $record ) ) return $default;
    foreach ( (array) $keys as $key ) {
        if ( ! is_string( $key ) || $key === '' ) continue;
        if ( strpos( $key, '.' ) !== false ) {
            $parts = explode( '.', $key );
            $value = $record;
            $ok = true;
            foreach ( $parts as $part ) {
                if ( ! is_array( $value ) || ! array_key_exists( $part, $value ) ) {
                    $ok = false;
                    break;
                }
                $value = $value[ $part ];
            }
            if ( $ok && $value !== null && $value !== '' ) {
                return $extract_scalar( $value );
            }
            continue;
        }
        if ( array_key_exists( $key, $record ) && $record[ $key ] !== null && $record[ $key ] !== '' ) {
            return $extract_scalar( $record[ $key ] );
        }
    }
    return $default;
}

function fus_zoho_normalize_mobile( $mobile ) {
    return preg_replace( '/\D+/', '', (string) $mobile );
}

function fus_zoho_map_record( $record, $module ) {
    $module = fus_zoho_sanitize_module( $module );
    $campaign_keys = ( $module === 'Contacts' )
        ? array( 'Campaign1', 'Campaign_21', 'Campaign', 'Campaign_Name', 'UTM_Campaign', 'utm_campaign' )
        : array( 'Campaign_21', 'Campaign1', 'Campaign', 'Campaign_Name', 'UTM_Campaign', 'utm_campaign' );
    $branch_keys = array( 'Branch', 'Branch_Name', 'branch', 'Office_Branch', 'Location_Branch' );
    $name = trim( fus_zoho_value_from_record( $record, array( 'Full_Name', 'full_name', 'Last_Name', 'Company' ) ) );
    if ( $name === '' ) {
        $first = trim( fus_zoho_value_from_record( $record, array( 'First_Name', 'first_name' ) ) );
        $last  = trim( fus_zoho_value_from_record( $record, array( 'Last_Name', 'last_name' ) ) );
        $name  = trim( $first . ' ' . $last );
    }
    $campaign_val = trim( fus_zoho_value_from_record( $record, $campaign_keys ) );
    $branch_val = trim( fus_zoho_value_from_record( $record, $branch_keys ) );

    // Fallback: handle tenant-specific custom field keys that include the target token.
    if ( is_array( $record ) ) {
        if ( $campaign_val === '' ) {
            foreach ( $record as $rk => $rv ) {
                if ( ! is_string( $rk ) ) continue;
                $norm = strtolower( preg_replace( '/[^a-z0-9]/', '', $rk ) );
                if ( strpos( $norm, 'campaign' ) === false ) continue;
                $guess = trim( fus_zoho_value_from_record( $record, array( $rk ) ) );
                if ( $guess !== '' ) { $campaign_val = $guess; break; }
            }
        }
        if ( $branch_val === '' ) {
            foreach ( $record as $rk => $rv ) {
                if ( ! is_string( $rk ) ) continue;
                $norm = strtolower( preg_replace( '/[^a-z0-9]/', '', $rk ) );
                if ( strpos( $norm, 'branch' ) === false ) continue;
                $guess = trim( fus_zoho_value_from_record( $record, array( $rk ) ) );
                if ( $guess !== '' ) { $branch_val = $guess; break; }
            }
        }
    }

    return array(
        'module' => $module,
        'record_id' => fus_zoho_value_from_record( $record, array( 'id' ) ),
        'name' => $name,
        'email' => sanitize_email( fus_zoho_value_from_record( $record, array( 'Email', 'email' ) ) ),
        'mobile' => trim( fus_zoho_value_from_record( $record, array( 'Mobile', 'Phone', 'mobile', 'phone' ) ) ),
        'origin' => trim( fus_zoho_value_from_record( $record, array( 'Origin', 'origin', 'Lead_Origin', 'Lead_Origin_Source' ) ) ),
        'lead_source' => trim( fus_zoho_value_from_record( $record, array( 'Lead_Source', 'LeadSource', 'lead_source' ) ) ),
        'branch' => $branch_val,
        'campaign' => $campaign_val,
        'medium' => trim( fus_zoho_value_from_record( $record, array( 'Medium', 'UTM_Medium', 'utm_medium' ) ) ),
        'term' => trim( fus_zoho_value_from_record( $record, array( 'Term', 'UTM_Term', 'utm_term', 'Keyword', 'Search_Term' ) ) ),
        'cta' => trim( fus_zoho_value_from_record( $record, array( 'CTA', 'Call_To_Action', 'CTA_Name' ) ) ),
        'lead_owner' => trim( fus_zoho_value_from_record( $record, array( 'Owner.name', 'Lead_Owner.name', 'Owner' ) ) ),
        'total_meetings' => (int) fus_zoho_value_from_record( $record, array( 'Total_Meetings', 'No_of_Meetings', 'Meetings' ), 0 ),
        'total_opportunities' => (int) fus_zoho_value_from_record( $record, array( 'No_of_Opportunities', 'Number_of_Opportunities', 'Total_Opportunities', 'Opportunities' ), 0 ),
        'last_activities' => trim( fus_zoho_value_from_record( $record, array( 'Last_Activity_Time', 'Last_Activity', 'Modified_Time' ) ) ),
    );
}

function fus_zoho_sync_record_to_wp( $mapped ) {
    global $wpdb;

    if ( ! is_array( $mapped ) ) return 0;
    $email = isset( $mapped['email'] ) ? sanitize_email( (string) $mapped['email'] ) : '';
    $mobile = isset( $mapped['mobile'] ) ? sanitize_text_field( (string) $mapped['mobile'] ) : '';
    $mobile_digits = fus_zoho_normalize_mobile( $mobile );

    $user_ids = array();
    if ( $email !== '' ) {
        $uid = email_exists( $email );
        if ( $uid ) $user_ids[] = (int) $uid;
    }
    if ( $mobile !== '' ) {
        $mobile_matches = $wpdb->get_col( $wpdb->prepare(
            "SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = %s AND meta_value = %s",
            FUS_MOBILE_META,
            $mobile
        ) );
        if ( is_array( $mobile_matches ) ) {
            foreach ( $mobile_matches as $uid ) $user_ids[] = (int) $uid;
        }
    }
    if ( $mobile_digits !== '' ) {
        $mobile_matches = $wpdb->get_col( $wpdb->prepare(
            "SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = %s AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(meta_value, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') = %s",
            FUS_MOBILE_META,
            $mobile_digits
        ) );
        if ( is_array( $mobile_matches ) ) {
            foreach ( $mobile_matches as $uid ) $user_ids[] = (int) $uid;
        }
    }

    $user_ids = array_values( array_unique( array_filter( array_map( 'intval', $user_ids ) ) ) );
    if ( empty( $user_ids ) ) return 0;

    $updates = array();
    if ( isset( $mapped['origin'] ) && (string) $mapped['origin'] !== '' ) $updates[ FUS_ZOHO_ORIGIN_META ] = (string) $mapped['origin'];
    if ( isset( $mapped['lead_source'] ) && (string) $mapped['lead_source'] !== '' ) $updates[ FUS_ZOHO_LEAD_SOURCE_META ] = (string) $mapped['lead_source'];
    if ( isset( $mapped['branch'] ) && (string) $mapped['branch'] !== '' ) $updates[ FUS_ZOHO_BRANCH_META ] = (string) $mapped['branch'];
    if ( isset( $mapped['campaign'] ) && (string) $mapped['campaign'] !== '' ) $updates[ FUS_ZOHO_CAMPAIGN_META ] = (string) $mapped['campaign'];
    if ( isset( $mapped['medium'] ) && (string) $mapped['medium'] !== '' ) $updates[ FUS_ZOHO_MEDIUM_META ] = (string) $mapped['medium'];
    if ( isset( $mapped['term'] ) && (string) $mapped['term'] !== '' ) $updates[ FUS_ZOHO_TERM_META ] = (string) $mapped['term'];
    if ( isset( $mapped['cta'] ) && (string) $mapped['cta'] !== '' ) $updates[ FUS_ZOHO_CTA_META ] = (string) $mapped['cta'];
    if ( isset( $mapped['lead_owner'] ) && (string) $mapped['lead_owner'] !== '' ) $updates[ FUS_ZOHO_LEAD_OWNER_META ] = (string) $mapped['lead_owner'];
    if ( isset( $mapped['total_meetings'] ) && (string) $mapped['total_meetings'] !== '' ) $updates[ FUS_ZOHO_MEETINGS_META ] = (int) $mapped['total_meetings'];
    if ( isset( $mapped['total_opportunities'] ) && (string) $mapped['total_opportunities'] !== '' ) $updates[ FUS_ZOHO_OPPORTUNITIES_META ] = (int) $mapped['total_opportunities'];
    if ( isset( $mapped['last_activities'] ) && (string) $mapped['last_activities'] !== '' ) $updates[ FUS_ZOHO_LAST_ACTIVITY_META ] = (string) $mapped['last_activities'];

    foreach ( $user_ids as $user_id ) {
        foreach ( $updates as $meta_key => $meta_value ) {
            update_user_meta( $user_id, $meta_key, $meta_value );
        }
        if ( $mobile !== '' ) update_user_meta( $user_id, FUS_MOBILE_META, $mobile );
    }

    return count( $user_ids );
}

function fus_zoho_fetch_module_records( $module = 'Leads', $search = '', $page = 1, $per_page = 20 ) {
    $module = fus_zoho_sanitize_module( $module );
    $search = sanitize_text_field( (string) $search );
    $page = max( 1, (int) $page );
    $per_page = max( 1, min( 200, (int) $per_page ) );

    $token_data = fus_zoho_get_valid_access_token();
    if ( empty( $token_data['ok'] ) ) {
        return array(
            'ok' => false,
            'message' => isset( $token_data['message'] ) ? (string) $token_data['message'] : 'Zoho token unavailable.',
            'rows' => array(),
            'page' => $page,
            'per_page' => $per_page,
            'more_records' => false,
            'total' => 0,
            'synced' => 0,
            'module' => $module,
        );
    }

    $api_domain = fus_zoho_pick_api_domain( $token_data );
    $base = rtrim( $api_domain, '/' ) . '/crm/v2/' . rawurlencode( $module );
    $query = array(
        'page' => $page,
        'per_page' => $per_page,
    );
    $endpoint = $base;
    if ( $search !== '' ) {
        $endpoint = $base . '/search';
        $query['word'] = $search;
    }
    $url = add_query_arg( $query, $endpoint );

    $res = wp_remote_get( $url, array(
        'timeout' => 25,
        'headers' => array(
            'Authorization' => 'Zoho-oauthtoken ' . $token_data['access_token'],
        ),
    ) );
    if ( is_wp_error( $res ) ) {
        return array(
            'ok' => false,
            'message' => $res->get_error_message(),
            'rows' => array(),
            'page' => $page,
            'per_page' => $per_page,
            'more_records' => false,
            'total' => 0,
            'synced' => 0,
            'module' => $module,
        );
    }

    $code = (int) wp_remote_retrieve_response_code( $res );
    $body = (string) wp_remote_retrieve_body( $res );
    $json = json_decode( $body, true );
    if ( ! is_array( $json ) ) $json = array();
    if ( $code < 200 || $code >= 300 ) {
        $msg = ! empty( $json['message'] ) ? (string) $json['message'] : ( 'Zoho API request failed (HTTP ' . $code . ').' );
        if ( ! empty( $json['code'] ) ) $msg = (string) $json['code'] . ': ' . $msg;
        return array(
            'ok' => false,
            'message' => $msg,
            'rows' => array(),
            'page' => $page,
            'per_page' => $per_page,
            'more_records' => false,
            'total' => 0,
            'synced' => 0,
            'module' => $module,
        );
    }

    $records = ( isset( $json['data'] ) && is_array( $json['data'] ) ) ? $json['data'] : array();
    $info = ( isset( $json['info'] ) && is_array( $json['info'] ) ) ? $json['info'] : array();
    $more_records = ! empty( $info['more_records'] );

    $rows = array();
    $synced = 0;
    foreach ( $records as $record ) {
        $mapped = fus_zoho_map_record( is_array( $record ) ? $record : array(), $module );
        $synced += fus_zoho_sync_record_to_wp( $mapped );
        $rows[] = $mapped;
    }

    // Zoho v2 list/search does not always return an exact total count.
    // Keep this as a minimum known total; UI can append "+" when more records are available.
    $estimated_total = ( ( $page - 1 ) * $per_page ) + count( $rows );

    return array(
        'ok' => true,
        'message' => '',
        'rows' => $rows,
        'page' => $page,
        'per_page' => $per_page,
        'more_records' => $more_records,
        'total' => (int) $estimated_total,
        'synced' => (int) $synced,
        'module' => $module,
    );
}

function fus_zoho_sync_segments_allowed() {
    return array( 'all', 'registered', 'uploaded', 'internal', 'testing' );
}

function fus_zoho_sanitize_sync_segment( $segment ) {
    $segment = sanitize_key( (string) $segment );
    return in_array( $segment, fus_zoho_sync_segments_allowed(), true ) ? $segment : 'all';
}

function fus_zoho_pick_best_record( $records, $module ) {
    if ( ! is_array( $records ) || empty( $records ) ) return array();
    $best = array();
    $best_score = -1;
    foreach ( $records as $record ) {
        if ( ! is_array( $record ) ) continue;
        $mapped = fus_zoho_map_record( $record, $module );
        $score = 0;
        foreach ( array( 'branch', 'campaign', 'lead_source', 'origin', 'lead_owner', 'email', 'mobile' ) as $key ) {
            if ( isset( $mapped[ $key ] ) && trim( (string) $mapped[ $key ] ) !== '' ) $score++;
        }
        if ( $score > $best_score ) {
            $best_score = $score;
            $best = $record;
        }
    }
    if ( empty( $best ) ) {
        return is_array( $records[0] ) ? $records[0] : array();
    }
    return $best;
}

function fus_zoho_find_member_record( $email, $mobile ) {
    $email = sanitize_email( (string) $email );
    $mobile = sanitize_text_field( (string) $mobile );
    if ( $email === '' && $mobile === '' ) {
        return array( 'ok' => false, 'type' => 'error', 'message' => 'No email/mobile available.', 'mapped' => array() );
    }

    $contacts = fus_zoho_search_module( 'Contacts', $email, $mobile );
    if ( ! empty( $contacts['ok'] ) && ! empty( $contacts['records'] ) && is_array( $contacts['records'] ) ) {
        $record = fus_zoho_pick_best_record( $contacts['records'], 'Contacts' );
        $mapped = fus_zoho_map_record( $record, 'Contacts' );
        if ( ! empty( $mapped['record_id'] ) ) {
            // Use full record fetch (same behavior as debug raw fetch) to avoid missing custom fields in restricted-field responses.
            $full = fus_zoho_get_record_by_id( 'Contacts', (string) $mapped['record_id'] );
            if ( ! empty( $full['ok'] ) && ! empty( $full['record'] ) ) {
                $full_mapped = fus_zoho_map_record( (array) $full['record'], 'Contacts' );
                if ( (string) $full_mapped['branch'] !== '' ) $mapped['branch'] = (string) $full_mapped['branch'];
                if ( (string) $full_mapped['campaign'] !== '' ) $mapped['campaign'] = (string) $full_mapped['campaign'];
                if ( (string) $full_mapped['origin'] !== '' ) $mapped['origin'] = (string) $full_mapped['origin'];
                if ( (string) $full_mapped['lead_source'] !== '' ) $mapped['lead_source'] = (string) $full_mapped['lead_source'];
                if ( (string) $full_mapped['lead_owner'] !== '' ) $mapped['lead_owner'] = (string) $full_mapped['lead_owner'];
            }
        }
        return array( 'ok' => true, 'type' => 'client', 'message' => 'Matched in Contacts.', 'mapped' => $mapped );
    }
    if ( empty( $contacts['ok'] ) ) {
        return array( 'ok' => false, 'type' => 'error', 'message' => (string) $contacts['message'], 'mapped' => array() );
    }

    $leads = fus_zoho_search_module( 'Leads', $email, $mobile );
    if ( ! empty( $leads['ok'] ) && ! empty( $leads['records'] ) && is_array( $leads['records'] ) ) {
        $record = fus_zoho_pick_best_record( $leads['records'], 'Leads' );
        $mapped = fus_zoho_map_record( $record, 'Leads' );
        if ( ! empty( $mapped['record_id'] ) ) {
            // Use full record fetch (same behavior as debug raw fetch) to avoid missing custom fields in restricted-field responses.
            $full = fus_zoho_get_record_by_id( 'Leads', (string) $mapped['record_id'] );
            if ( ! empty( $full['ok'] ) && ! empty( $full['record'] ) ) {
                $full_mapped = fus_zoho_map_record( (array) $full['record'], 'Leads' );
                if ( (string) $full_mapped['branch'] !== '' ) $mapped['branch'] = (string) $full_mapped['branch'];
                if ( (string) $full_mapped['campaign'] !== '' ) $mapped['campaign'] = (string) $full_mapped['campaign'];
                if ( (string) $full_mapped['origin'] !== '' ) $mapped['origin'] = (string) $full_mapped['origin'];
                if ( (string) $full_mapped['lead_source'] !== '' ) $mapped['lead_source'] = (string) $full_mapped['lead_source'];
                if ( (string) $full_mapped['lead_owner'] !== '' ) $mapped['lead_owner'] = (string) $full_mapped['lead_owner'];
            }
        }
        return array( 'ok' => true, 'type' => 'lead', 'message' => 'Matched in Leads.', 'mapped' => $mapped );
    }
    if ( empty( $leads['ok'] ) ) {
        return array( 'ok' => false, 'type' => 'error', 'message' => (string) $leads['message'], 'mapped' => array() );
    }

    return array( 'ok' => true, 'type' => 'not_found', 'message' => 'No Zoho match found.', 'mapped' => array() );
}

function fus_zoho_apply_mapped_to_user( $user_id, $mapped ) {
    $user_id = (int) $user_id;
    if ( $user_id <= 0 || ! is_array( $mapped ) ) return false;

    $updates = array();
    if ( isset( $mapped['origin'] ) && (string) $mapped['origin'] !== '' ) $updates[ FUS_ZOHO_ORIGIN_META ] = (string) $mapped['origin'];
    if ( isset( $mapped['lead_source'] ) && (string) $mapped['lead_source'] !== '' ) $updates[ FUS_ZOHO_LEAD_SOURCE_META ] = (string) $mapped['lead_source'];
    if ( isset( $mapped['branch'] ) && (string) $mapped['branch'] !== '' ) $updates[ FUS_ZOHO_BRANCH_META ] = (string) $mapped['branch'];
    if ( isset( $mapped['campaign'] ) && (string) $mapped['campaign'] !== '' ) $updates[ FUS_ZOHO_CAMPAIGN_META ] = (string) $mapped['campaign'];
    if ( isset( $mapped['medium'] ) && (string) $mapped['medium'] !== '' ) $updates[ FUS_ZOHO_MEDIUM_META ] = (string) $mapped['medium'];
    if ( isset( $mapped['term'] ) && (string) $mapped['term'] !== '' ) $updates[ FUS_ZOHO_TERM_META ] = (string) $mapped['term'];
    if ( isset( $mapped['cta'] ) && (string) $mapped['cta'] !== '' ) $updates[ FUS_ZOHO_CTA_META ] = (string) $mapped['cta'];
    if ( isset( $mapped['lead_owner'] ) && (string) $mapped['lead_owner'] !== '' ) $updates[ FUS_ZOHO_LEAD_OWNER_META ] = (string) $mapped['lead_owner'];
    if ( isset( $mapped['total_meetings'] ) && (string) $mapped['total_meetings'] !== '' ) $updates[ FUS_ZOHO_MEETINGS_META ] = (int) $mapped['total_meetings'];
    if ( isset( $mapped['total_opportunities'] ) && (string) $mapped['total_opportunities'] !== '' ) $updates[ FUS_ZOHO_OPPORTUNITIES_META ] = (int) $mapped['total_opportunities'];
    if ( isset( $mapped['last_activities'] ) && (string) $mapped['last_activities'] !== '' ) $updates[ FUS_ZOHO_LAST_ACTIVITY_META ] = (string) $mapped['last_activities'];

    foreach ( $updates as $meta_key => $meta_value ) {
        update_user_meta( $user_id, $meta_key, $meta_value );
    }
    if ( isset( $mapped['mobile'] ) && (string) $mapped['mobile'] !== '' ) {
        update_user_meta( $user_id, FUS_MOBILE_META, sanitize_text_field( (string) $mapped['mobile'] ) );
    }
    return true;
}

function fus_set_zoho_cached_status( $user_id, $type, $message = '' ) {
    $user_id = (int) $user_id;
    if ( $user_id <= 0 ) return;

    $allowed = array( 'client', 'lead', 'not_found', 'error' );
    $type = sanitize_key( (string) $type );
    if ( ! in_array( $type, $allowed, true ) ) $type = 'error';
    $message = sanitize_text_field( (string) $message );

    update_user_meta( $user_id, FUS_ZOHO_STATUS_META, $type );
    update_user_meta( $user_id, FUS_ZOHO_STATUS_MSG_META, $message );
    update_user_meta( $user_id, FUS_ZOHO_STATUS_AT_META, time() );
}

function fus_get_zoho_cached_status( $user_id ) {
    $type = sanitize_key( (string) get_user_meta( (int) $user_id, FUS_ZOHO_STATUS_META, true ) );
    $message = sanitize_text_field( (string) get_user_meta( (int) $user_id, FUS_ZOHO_STATUS_MSG_META, true ) );
    $allowed = array( 'client', 'lead', 'not_found', 'error' );
    if ( ! in_array( $type, $allowed, true ) ) $type = 'pending';
    return array(
        'type' => $type,
        'message' => $message,
    );
}

add_action( 'admin_post_fus_save_zoho_oauth', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Unauthorized' );
    check_admin_referer( 'fus_save_zoho_oauth' );

    $settings = fus_get_zoho_oauth_settings();
    $settings['accounts_url'] = fus_sanitize_zoho_accounts_url( isset( $_POST['accounts_url'] ) ? wp_unslash( $_POST['accounts_url'] ) : $settings['accounts_url'] );
    $settings['api_domain'] = sanitize_text_field( isset( $_POST['api_domain'] ) ? wp_unslash( $_POST['api_domain'] ) : '' );
    $settings['client_id'] = sanitize_text_field( isset( $_POST['client_id'] ) ? wp_unslash( $_POST['client_id'] ) : '' );

    $client_secret = isset( $_POST['client_secret'] ) ? trim( (string) wp_unslash( $_POST['client_secret'] ) ) : '';
    if ( $client_secret !== '' ) $settings['client_secret'] = $client_secret;

    $refresh_token = isset( $_POST['refresh_token'] ) ? trim( (string) wp_unslash( $_POST['refresh_token'] ) ) : '';
    if ( $refresh_token !== '' ) $settings['refresh_token'] = $refresh_token;

    fus_save_zoho_oauth_settings( $settings );
    wp_safe_redirect( admin_url( 'admin.php?page=finnovate-user-stats&tab=zoho&zoho_msg=saved' ) );
    exit;
} );

add_action( 'admin_post_fus_refresh_zoho_token', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Unauthorized' );
    check_admin_referer( 'fus_refresh_zoho_token' );

    $result = fus_refresh_zoho_access_token();
    $query = array(
        'page'     => 'finnovate-user-stats',
        'tab'      => 'zoho',
        'zoho_msg' => $result['ok'] ? 'refreshed' : 'error',
    );
    if ( ! $result['ok'] ) $query['zoho_err'] = rawurlencode( (string) $result['message'] );

    wp_safe_redirect( admin_url( 'admin.php?' . http_build_query( $query ) ) );
    exit;
} );

add_action( 'admin_post_fus_sync_zoho_wp_users', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Unauthorized' );
    check_admin_referer( 'fus_sync_zoho_wp_users' );
    if ( function_exists( 'ignore_user_abort' ) ) {
        @ignore_user_abort( true );
    }
    if ( function_exists( 'set_time_limit' ) ) {
        @set_time_limit( 120 );
    }

    $sync_segment = fus_zoho_sanitize_sync_segment( isset( $_POST['zoho_sync_segment'] ) ? wp_unslash( $_POST['zoho_sync_segment'] ) : 'all' );
    $return_module = fus_zoho_sanitize_module( isset( $_POST['zoho_module'] ) ? wp_unslash( $_POST['zoho_module'] ) : 'Leads' );
    $return_search = sanitize_text_field( isset( $_POST['zoho_tab_search'] ) ? wp_unslash( $_POST['zoho_tab_search'] ) : '' );
    $return_per_page = max( 1, min( 50, (int) ( isset( $_POST['zoho_tab_per_page'] ) ? $_POST['zoho_tab_per_page'] : 20 ) ) );
    $start_offset = max( 0, (int) ( isset( $_POST['zoho_sync_offset'] ) ? $_POST['zoho_sync_offset'] : 0 ) );
    $segment_for_query = ( $sync_segment === 'all' ) ? 'total' : $sync_segment;
    $user_ids = fus_get_filtered_user_ids( $segment_for_query, '', '', '', 'all' );
    $total = is_array( $user_ids ) ? count( $user_ids ) : 0;

    $processed = max( 0, (int) ( isset( $_POST['zoho_sync_processed'] ) ? $_POST['zoho_sync_processed'] : 0 ) );
    $synced = max( 0, (int) ( isset( $_POST['zoho_sync_synced'] ) ? $_POST['zoho_sync_synced'] : 0 ) );
    $errors = max( 0, (int) ( isset( $_POST['zoho_sync_errors'] ) ? $_POST['zoho_sync_errors'] : 0 ) );
    $not_found = max( 0, (int) ( isset( $_POST['zoho_sync_not_found'] ) ? $_POST['zoho_sync_not_found'] : 0 ) );
    if ( $start_offset > $total ) $start_offset = $total;
    $time_budget = (int) apply_filters( 'fus_zoho_sync_time_budget', 15 );
    if ( $time_budget < 5 ) $time_budget = 5;
    $started_at = microtime( true );
    $next_offset = $start_offset;

    if ( ! empty( $user_ids ) ) {
        for ( $i = $start_offset; $i < $total; $i++ ) {
            if ( ( microtime( true ) - $started_at ) >= $time_budget ) {
                break;
            }
            $user_id = $user_ids[ $i ];
            $user_id = (int) $user_id;
            $next_offset = $i + 1;
            if ( $user_id <= 0 ) continue;
            $user = get_userdata( $user_id );
            if ( ! $user ) continue;

            $email = isset( $user->user_email ) ? (string) $user->user_email : '';
            $mobile = (string) get_user_meta( $user_id, FUS_MOBILE_META, true );
            $found = fus_zoho_find_member_record( $email, $mobile );
            $processed++;

            if ( empty( $found['ok'] ) ) {
                $errors++;
                fus_set_zoho_cached_status( $user_id, 'error', isset( $found['message'] ) ? (string) $found['message'] : 'Zoho lookup failed.' );
                continue;
            }

            $type = isset( $found['type'] ) ? sanitize_key( (string) $found['type'] ) : 'not_found';
            $message = isset( $found['message'] ) ? (string) $found['message'] : '';
            if ( $type === 'not_found' ) {
                $not_found++;
                fus_set_zoho_cached_status( $user_id, 'not_found', $message );
                continue;
            }

            $mapped = isset( $found['mapped'] ) && is_array( $found['mapped'] ) ? $found['mapped'] : array();
            if ( ! empty( $mapped ) && fus_zoho_apply_mapped_to_user( $user_id, $mapped ) ) {
                $synced++;
            }
            fus_set_zoho_cached_status( $user_id, in_array( $type, array( 'client', 'lead' ), true ) ? $type : 'not_found', $message );
        }
    }
    if ( $processed > 0 ) {
        $sync_at_map = get_option( FUS_ZOHO_LAST_SYNC_AT_OPTION, array() );
        if ( ! is_array( $sync_at_map ) ) $sync_at_map = array();
        $sync_at_map[ $sync_segment ] = time();
        update_option( FUS_ZOHO_LAST_SYNC_AT_OPTION, $sync_at_map, false );
    }

    $is_partial = ( $next_offset < $total );
    $query = array(
        'page' => 'finnovate-user-stats',
        'tab' => 'zoho',
        'zoho_msg' => $is_partial ? 'sync_partial' : 'sync_done',
        'zoho_sync_segment' => $sync_segment,
        'zoho_module' => $return_module,
        'zoho_tab_search' => $return_search,
        'zoho_tab_per_page' => $return_per_page,
        'zoho_tab_paged' => 1,
        'zoho_sync_total' => $total,
        'zoho_sync_processed' => $processed,
        'zoho_sync_synced' => $synced,
        'zoho_sync_not_found' => $not_found,
        'zoho_sync_errors' => $errors,
    );
    if ( $is_partial ) {
        $query['zoho_sync_offset'] = $next_offset;
    }
    wp_safe_redirect( admin_url( 'admin.php?' . http_build_query( $query ) ) );
    exit;
} );

add_action( 'admin_post_fus_sync_zoho_selected_users', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Unauthorized' );
    check_admin_referer( 'fus_sync_zoho_wp_users' );

    $sync_segment = fus_zoho_sanitize_sync_segment( isset( $_POST['zoho_sync_segment'] ) ? wp_unslash( $_POST['zoho_sync_segment'] ) : 'all' );
    $return_module = fus_zoho_sanitize_module( isset( $_POST['zoho_module'] ) ? wp_unslash( $_POST['zoho_module'] ) : 'Leads' );
    $return_search = sanitize_text_field( isset( $_POST['zoho_tab_search'] ) ? wp_unslash( $_POST['zoho_tab_search'] ) : '' );
    $return_per_page = max( 1, min( 50, (int) ( isset( $_POST['zoho_tab_per_page'] ) ? $_POST['zoho_tab_per_page'] : 20 ) ) );
    $return_paged = max( 1, (int) ( isset( $_POST['zoho_tab_paged'] ) ? $_POST['zoho_tab_paged'] : 1 ) );
    $raw_ids = isset( $_POST['zoho_selected_user_ids'] ) && is_array( $_POST['zoho_selected_user_ids'] ) ? $_POST['zoho_selected_user_ids'] : array();
    $selected_ids = array_values( array_unique( array_filter( array_map( 'absint', $raw_ids ) ) ) );

    if ( empty( $selected_ids ) ) {
        $query = array(
            'page' => 'finnovate-user-stats',
            'tab' => 'zoho',
            'zoho_msg' => 'error',
            'zoho_err' => rawurlencode( 'Select at least one user to sync.' ),
            'zoho_sync_segment' => $sync_segment,
            'zoho_module' => $return_module,
            'zoho_tab_search' => $return_search,
            'zoho_tab_per_page' => $return_per_page,
            'zoho_tab_paged' => $return_paged,
        );
        wp_safe_redirect( admin_url( 'admin.php?' . http_build_query( $query ) ) );
        exit;
    }

    $processed = 0;
    $synced = 0;
    $errors = 0;
    $not_found = 0;
    foreach ( $selected_ids as $user_id ) {
        $user_id = (int) $user_id;
        if ( $user_id <= 0 ) continue;
        $user = get_userdata( $user_id );
        if ( ! $user ) continue;

        $email = isset( $user->user_email ) ? (string) $user->user_email : '';
        $mobile = (string) get_user_meta( $user_id, FUS_MOBILE_META, true );
        $found = fus_zoho_find_member_record( $email, $mobile );
        $processed++;

        if ( empty( $found['ok'] ) ) {
            $errors++;
            fus_set_zoho_cached_status( $user_id, 'error', isset( $found['message'] ) ? (string) $found['message'] : 'Zoho lookup failed.' );
            continue;
        }

        $type = isset( $found['type'] ) ? sanitize_key( (string) $found['type'] ) : 'not_found';
        $message = isset( $found['message'] ) ? (string) $found['message'] : '';
        if ( $type === 'not_found' ) {
            $not_found++;
            fus_set_zoho_cached_status( $user_id, 'not_found', $message );
            continue;
        }

        $mapped = isset( $found['mapped'] ) && is_array( $found['mapped'] ) ? $found['mapped'] : array();
        if ( ! empty( $mapped ) && fus_zoho_apply_mapped_to_user( $user_id, $mapped ) ) {
            $synced++;
        }
        fus_set_zoho_cached_status( $user_id, in_array( $type, array( 'client', 'lead' ), true ) ? $type : 'not_found', $message );
    }

    if ( $processed > 0 ) {
        $sync_at_map = get_option( FUS_ZOHO_LAST_SYNC_AT_OPTION, array() );
        if ( ! is_array( $sync_at_map ) ) $sync_at_map = array();
        $sync_at_map[ $sync_segment ] = time();
        update_option( FUS_ZOHO_LAST_SYNC_AT_OPTION, $sync_at_map, false );
    }

    $query = array(
        'page' => 'finnovate-user-stats',
        'tab' => 'zoho',
        'zoho_msg' => 'sync_done',
        'zoho_sync_segment' => $sync_segment,
        'zoho_module' => $return_module,
        'zoho_tab_search' => $return_search,
        'zoho_tab_per_page' => $return_per_page,
        'zoho_tab_paged' => $return_paged,
        'zoho_sync_total' => count( $selected_ids ),
        'zoho_sync_processed' => $processed,
        'zoho_sync_synced' => $synced,
        'zoho_sync_not_found' => $not_found,
        'zoho_sync_errors' => $errors,
    );
    wp_safe_redirect( admin_url( 'admin.php?' . http_build_query( $query ) ) );
    exit;
} );

add_action( 'wp_ajax_fus_get_zoho_member_type', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( array( 'message' => 'Unauthorized' ), 403 );
    check_ajax_referer( 'fus_zoho_lookup', 'nonce' );

    $user_id = absint( isset( $_GET['user_id'] ) ? $_GET['user_id'] : 0 );
    if ( ! $user_id ) wp_send_json_error( array( 'message' => 'Invalid user.' ), 400 );
    $user = get_userdata( $user_id );
    if ( ! $user ) wp_send_json_error( array( 'message' => 'User not found.' ), 404 );

    $email = isset( $user->user_email ) ? (string) $user->user_email : '';
    $mobile = (string) get_user_meta( $user_id, FUS_MOBILE_META, true );
    $result = fus_zoho_classify_member( $email, $mobile );
    if ( empty( $result['ok'] ) ) {
        fus_set_zoho_cached_status( $user_id, 'error', isset( $result['message'] ) ? (string) $result['message'] : 'Zoho lookup failed.' );
        wp_send_json_error( array( 'message' => (string) $result['message'] ), 400 );
    }

    fus_set_zoho_cached_status( $user_id, (string) $result['type'], isset( $result['message'] ) ? (string) $result['message'] : '' );

    wp_send_json_success( array(
        'user_id' => $user_id,
        'type' => (string) $result['type'],
        'module' => (string) $result['module'],
        'message' => (string) $result['message'],
    ) );
} );

add_action( 'wp_ajax_fus_get_filtered_user_ids', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( array( 'message' => 'Unauthorized' ), 403 );
    check_ajax_referer( 'fus_zoho_bulk', 'nonce' );

    $segment = sanitize_key( isset( $_GET['segment'] ) ? $_GET['segment'] : 'total' );
    if ( $segment === '' ) $segment = 'total';
    $date_from = sanitize_text_field( isset( $_GET['date_from'] ) ? $_GET['date_from'] : '' );
    $date_to   = sanitize_text_field( isset( $_GET['date_to'] ) ? $_GET['date_to'] : '' );
    $search    = sanitize_text_field( isset( $_GET['search'] ) ? $_GET['search'] : '' );
    $zoho_filter = fus_sanitize_zoho_filter( isset( $_GET['zoho_filter'] ) ? $_GET['zoho_filter'] : 'all' );

    $ids = fus_get_filtered_user_ids( $segment, $date_from, $date_to, $search, $zoho_filter );
    wp_send_json_success( array(
        'ids' => array_values( array_map( 'intval', $ids ) ),
        'total' => count( $ids ),
    ) );
} );

add_action( 'wp_ajax_fus_check_zoho_bulk', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( array( 'message' => 'Unauthorized' ), 403 );
    check_ajax_referer( 'fus_zoho_bulk', 'nonce' );

    $raw_ids = isset( $_POST['user_ids'] ) && is_array( $_POST['user_ids'] ) ? $_POST['user_ids'] : array();
    $user_ids = array_values( array_unique( array_filter( array_map( 'absint', $raw_ids ) ) ) );
    if ( empty( $user_ids ) ) {
        wp_send_json_error( array( 'message' => 'No users provided.' ), 400 );
    }
    if ( count( $user_ids ) > 20 ) {
        $user_ids = array_slice( $user_ids, 0, 20 );
    }

    $results = array();
    foreach ( $user_ids as $user_id ) {
        $type = 'error';
        $message = '';

        $user = get_userdata( $user_id );
        if ( ! $user ) {
            $message = 'User not found.';
        } else {
            $email = isset( $user->user_email ) ? (string) $user->user_email : '';
            $mobile = (string) get_user_meta( $user_id, FUS_MOBILE_META, true );
            $lookup = fus_zoho_classify_member( $email, $mobile );
            if ( empty( $lookup['ok'] ) ) {
                $type = 'error';
                $message = isset( $lookup['message'] ) ? (string) $lookup['message'] : 'Zoho lookup failed.';
            } else {
                $type = isset( $lookup['type'] ) ? sanitize_key( (string) $lookup['type'] ) : 'error';
                if ( ! in_array( $type, array( 'client', 'lead', 'not_found' ), true ) ) {
                    $type = 'error';
                }
                $message = isset( $lookup['message'] ) ? (string) $lookup['message'] : '';
            }
        }

        fus_set_zoho_cached_status( $user_id, $type, $message );
        $results[] = array(
            'user_id' => (int) $user_id,
            'type' => $type,
            'message' => $message,
        );
    }

    wp_send_json_success( array(
        'processed' => count( $results ),
        'results' => $results,
    ) );
} );

add_action( 'wp_ajax_fus_get_zoho_raw_user', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( array( 'message' => 'Unauthorized' ), 403 );
    check_ajax_referer( 'fus_zoho_raw', 'nonce' );

    $user_id = absint( isset( $_GET['user_id'] ) ? $_GET['user_id'] : 0 );
    if ( ! $user_id ) wp_send_json_error( array( 'message' => 'Invalid user.' ), 400 );
    $user = get_userdata( $user_id );
    if ( ! $user ) wp_send_json_error( array( 'message' => 'User not found.' ), 404 );

    $email = isset( $user->user_email ) ? sanitize_email( (string) $user->user_email ) : '';
    $mobile = (string) get_user_meta( $user_id, FUS_MOBILE_META, true );

    $contacts = fus_zoho_search_module( 'Contacts', $email, $mobile );
    $leads = fus_zoho_search_module( 'Leads', $email, $mobile );

    $selected_module = '';
    $selected_record = array();
    if ( ! empty( $contacts['ok'] ) && ! empty( $contacts['records'] ) && is_array( $contacts['records'] ) ) {
        $selected_module = 'Contacts';
        $selected_record = fus_zoho_pick_best_record( $contacts['records'], 'Contacts' );
    } elseif ( ! empty( $leads['ok'] ) && ! empty( $leads['records'] ) && is_array( $leads['records'] ) ) {
        $selected_module = 'Leads';
        $selected_record = fus_zoho_pick_best_record( $leads['records'], 'Leads' );
    }

    if ( $selected_module === '' || empty( $selected_record ) ) {
        wp_send_json_error( array(
            'message' => 'No Zoho match found for this user.',
            'user' => array(
                'id' => $user_id,
                'email' => $email,
                'mobile' => $mobile,
            ),
            'contacts_search' => $contacts,
            'leads_search' => $leads,
        ), 404 );
    }

    $mapped_search = fus_zoho_map_record( $selected_record, $selected_module );
    $record_id = isset( $mapped_search['record_id'] ) ? (string) $mapped_search['record_id'] : '';
    $full = array( 'ok' => false, 'message' => 'No record id found.', 'record' => array() );
    if ( $record_id !== '' ) {
        $full = fus_zoho_get_record_by_id( $selected_module, $record_id );
    }
    $mapped_full = ( ! empty( $full['ok'] ) && ! empty( $full['record'] ) && is_array( $full['record'] ) )
        ? fus_zoho_map_record( $full['record'], $selected_module )
        : array();
    $applied_mapped = ! empty( $mapped_full ) ? $mapped_full : $mapped_search;
    $applied = false;
    if ( ! empty( $applied_mapped ) && is_array( $applied_mapped ) ) {
        $applied = fus_zoho_apply_mapped_to_user( $user_id, $applied_mapped );
        fus_set_zoho_cached_status(
            $user_id,
            $selected_module === 'Contacts' ? 'client' : 'lead',
            'Applied mapped fields from Zoho fetch debug.'
        );
    }
    $saved_branch_meta = (string) get_user_meta( $user_id, FUS_ZOHO_BRANCH_META, true );
    $saved_campaign_meta = (string) get_user_meta( $user_id, FUS_ZOHO_CAMPAIGN_META, true );

    wp_send_json_success( array(
        'user' => array(
            'id' => $user_id,
            'name' => (string) $user->display_name,
            'email' => $email,
            'mobile' => $mobile,
        ),
        'matched_module' => $selected_module,
        'record_id' => $record_id,
        'mapped_from_search' => $mapped_search,
        'mapped_from_full' => $mapped_full,
        'search_record' => $selected_record,
        'full_record' => ( ! empty( $full['ok'] ) && is_array( $full['record'] ) ) ? $full['record'] : array(),
        'contacts_search' => $contacts,
        'leads_search' => $leads,
        'full_fetch' => $full,
        'applied_to_wp_user' => (bool) $applied,
        'applied_payload' => $applied_mapped,
        'saved_branch_meta' => $saved_branch_meta,
        'saved_campaign_meta' => $saved_campaign_meta,
    ) );
} );

// ─────────────────────────────────────────────────────────────────
// 1. TRACK LOGIN COUNT
// ─────────────────────────────────────────────────────────────────
function fus_increment_login_count( $user_id ) {
    static $incremented = array();
    $user_id = (int) $user_id;
    if ( $user_id <= 0 || isset( $incremented[$user_id] ) ) return;
    $incremented[$user_id] = true;
    $count = (int) get_user_meta( $user_id, FUS_LOGIN_COUNT_META, true );
    update_user_meta( $user_id, FUS_LOGIN_COUNT_META, $count + 1 );

    // Store daily login date for trend graph
    $today = date('Y-m-d');
    $log_key = 'fus_login_log_' . $today;
    $existing = get_user_meta( $user_id, $log_key, true );
    if ( ! $existing ) {
        update_user_meta( $user_id, $log_key, 1 );
    } else {
        update_user_meta( $user_id, $log_key, (int)$existing + 1 );
    }
}

add_action( 'wp_login', function( $user_login, $user ) {
    if ( ! $user || empty( $user->ID ) ) return;
    fus_increment_login_count( $user->ID );
}, 10, 2 );

add_action( 'bp_core_login_user', function( $user_id ) {
    fus_increment_login_count( $user_id );
}, 10, 1 );

add_action( 'set_logged_in_cookie', function( $logged_in_cookie, $expire, $expiration, $user_id ) {
    fus_increment_login_count( $user_id );
}, 10, 4 );

function fus_table_exists( $table_name ) {
    global $wpdb;
    static $cache = array();
    $table_name = (string) $table_name;
    if ( isset( $cache[ $table_name ] ) ) return $cache[ $table_name ];
    $cache[ $table_name ] = ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table_name ) ) === $table_name );
    return $cache[ $table_name ];
}

function fus_get_table_columns_assoc( $table_name ) {
    global $wpdb;
    static $cache = array();
    $table_name = (string) $table_name;
    if ( isset( $cache[ $table_name ] ) ) return $cache[ $table_name ];
    $cols = array();
    if ( ! fus_table_exists( $table_name ) ) {
        $cache[ $table_name ] = $cols;
        return $cols;
    }
    $rows = $wpdb->get_results( "SHOW COLUMNS FROM {$table_name}" );
    if ( $rows ) {
        foreach ( $rows as $row ) {
            if ( empty( $row->Field ) ) continue;
            $cols[ (string) $row->Field ] = isset( $row->Type ) ? strtolower( (string) $row->Type ) : '';
        }
    }
    $cache[ $table_name ] = $cols;
    return $cols;
}

function fus_pick_existing_column_name( $columns, $candidates ) {
    foreach ( (array) $candidates as $name ) {
        if ( isset( $columns[ $name ] ) ) return (string) $name;
    }
    return '';
}

function fus_get_wsal_login_source() {
    global $wpdb;
    static $cached = null;
    if ( is_array( $cached ) ) return $cached;

    $candidates = array( $wpdb->prefix . 'wsal_occurrences' );
    if ( isset( $wpdb->base_prefix ) && $wpdb->base_prefix && $wpdb->base_prefix !== $wpdb->prefix ) {
        $candidates[] = $wpdb->base_prefix . 'wsal_occurrences';
    }

    foreach ( $candidates as $table ) {
        if ( ! fus_table_exists( $table ) ) continue;
        $cols = fus_get_table_columns_assoc( $table );
        if ( empty( $cols ) ) continue;

        // Prefer wp_user_id first when available; many WSAL installs keep user_id as 0 while wp_user_id is populated.
        $user_col = fus_pick_existing_column_name( $cols, array( 'wp_user_id', 'user_id' ) );
        $username_col = fus_pick_existing_column_name( $cols, array( 'username', 'user_name', 'user_login' ) );
        $alert_col = fus_pick_existing_column_name( $cols, array( 'alert_id', 'event_id' ) );
        $created_col = fus_pick_existing_column_name( $cols, array( 'created_on', 'created_at', 'created_date' ) );
        if ( $user_col === '' || $alert_col === '' || $created_col === '' ) continue;

        $type = isset( $cols[ $created_col ] ) ? (string) $cols[ $created_col ] : '';
        $is_numeric_time = (bool) preg_match( '/(int|decimal|float|double)/', $type );
        $created_expr = $is_numeric_time ? "FROM_UNIXTIME(o.`{$created_col}`)" : "o.`{$created_col}`";

        $cached = array(
            'type' => 'wsal',
            'table' => $table,
            'user_col' => $user_col,
            'username_col' => $username_col,
            'alert_col' => $alert_col,
            'created_col' => $created_col,
            'created_expr' => $created_expr,
        );
        return $cached;
    }

    $cached = array( 'type' => 'meta' );
    return $cached;
}

function fus_get_wsal_login_event_ids() {
    $ids = apply_filters( 'fus_wsal_login_alert_ids', array( 1000 ) );
    if ( ! is_array( $ids ) ) $ids = array( 1000 );
    $ids = array_values( array_filter( array_map( 'intval', $ids ) ) );
    if ( empty( $ids ) ) $ids = array( 1000 );
    return $ids;
}

function fus_get_wsal_login_events_subquery() {
    global $wpdb;
    $src = fus_get_wsal_login_source();
    if ( empty( $src['type'] ) || $src['type'] !== 'wsal' ) return '';

    $table = (string) $src['table'];
    $user_col = (string) $src['user_col'];
    $username_col = (string) $src['username_col'];
    $alert_col = (string) $src['alert_col'];
    $created_expr = (string) $src['created_expr'];
    $event_ids = fus_get_wsal_login_event_ids();
    $event_ids_sql = implode( ',', array_map( 'intval', $event_ids ) );

    $join_user = '';
    $user_expr = "CAST(o.`{$user_col}` AS UNSIGNED)";
    if ( $username_col !== '' ) {
        $join_user = " LEFT JOIN {$wpdb->users} wu ON (wu.user_login = o.`{$username_col}` OR wu.user_email = o.`{$username_col}`)";
        $user_expr = "CASE
            WHEN CAST(o.`{$user_col}` AS UNSIGNED) > 0 THEN CAST(o.`{$user_col}` AS UNSIGNED)
            WHEN wu.ID IS NOT NULL THEN wu.ID
            ELSE 0
        END";
    }

    return "SELECT {$user_expr} AS user_id, {$created_expr} AS event_at
            FROM {$table} o{$join_user}
            WHERE o.`{$alert_col}` IN ({$event_ids_sql})";
}

function fus_maybe_import_wsal_login_history( $force = false ) {
    global $wpdb;

    $source = fus_get_wsal_login_source();
    if ( empty( $source['type'] ) || $source['type'] !== 'wsal' ) return false;

    $state = get_option( FUS_WSAL_IMPORT_STATE_OPTION, array() );
    if ( ! is_array( $state ) ) $state = array();
    $last_run = isset( $state['last_run'] ) ? (int) $state['last_run'] : 0;
    if ( ! $force && $last_run > 0 && ( time() - $last_run ) < 900 ) {
        return false;
    }

    $events_sub = fus_get_wsal_login_events_subquery();
    if ( $events_sub === '' ) return false;

    $rows = $wpdb->get_results(
        "SELECT ev.user_id, DATE(ev.event_at) AS dt, COUNT(*) AS cnt
         FROM ({$events_sub}) ev
         WHERE ev.user_id > 0
         GROUP BY ev.user_id, DATE(ev.event_at)"
    );
    if ( ! is_array( $rows ) || empty( $rows ) ) {
        $state['last_run'] = time();
        $state['last_imported_rows'] = 0;
        update_option( FUS_WSAL_IMPORT_STATE_OPTION, $state, false );
        return false;
    }

    $touched_users = array();
    $updated_rows = 0;
    foreach ( $rows as $r ) {
        $uid = isset( $r->user_id ) ? (int) $r->user_id : 0;
        $dt = isset( $r->dt ) ? (string) $r->dt : '';
        $cnt = isset( $r->cnt ) ? (int) $r->cnt : 0;
        if ( $uid <= 0 || $cnt <= 0 || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $dt ) ) continue;

        $key = 'fus_login_log_' . $dt;
        $existing = (int) get_user_meta( $uid, $key, true );
        // Dedup-safe merge: keep max per user/day between WSAL and local tracker.
        if ( $cnt > $existing ) {
            update_user_meta( $uid, $key, $cnt );
            $updated_rows++;
        }
        $touched_users[ $uid ] = true;
    }

    if ( ! empty( $touched_users ) ) {
        $user_ids = array_keys( $touched_users );
        $ids_sql = implode( ',', array_map( 'intval', $user_ids ) );
        $totals = $wpdb->get_results(
            "SELECT user_id, SUM(CAST(meta_value AS UNSIGNED)) AS total
             FROM {$wpdb->usermeta}
             WHERE meta_key LIKE 'fus_login_log_%'
               AND user_id IN ({$ids_sql})
             GROUP BY user_id"
        );
        if ( is_array( $totals ) ) {
            foreach ( $totals as $t ) {
                $uid = isset( $t->user_id ) ? (int) $t->user_id : 0;
                $total = isset( $t->total ) ? (int) $t->total : 0;
                if ( $uid > 0 ) update_user_meta( $uid, FUS_LOGIN_COUNT_META, max( 0, $total ) );
            }
        }
    }

    $state['last_run'] = time();
    $state['last_imported_rows'] = $updated_rows;
    $state['last_touched_users'] = count( $touched_users );
    update_option( FUS_WSAL_IMPORT_STATE_OPTION, $state, false );
    return true;
}

// ─────────────────────────────────────────────────────────────────
// 1B. TRACK PRE-LOGIN PAGE VIEWS (ANONYMOUS)
// ─────────────────────────────────────────────────────────────────
function fus_ensure_page_views_table() {
    global $wpdb;
    $table = $wpdb->prefix . 'fus_page_views';
    $charset_collate = $wpdb->get_charset_collate();

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $sql = "CREATE TABLE {$table} (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        user_id bigint(20) unsigned NOT NULL DEFAULT 0,
        post_id bigint(20) unsigned NOT NULL DEFAULT 0,
        post_title varchar(255) NOT NULL DEFAULT '',
        page_url text NULL,
        referrer_url text NULL,
        page_path varchar(255) NOT NULL DEFAULT '',
        time_spent int(11) unsigned NOT NULL DEFAULT 0,
        viewed_at datetime NOT NULL,
        is_logged_in tinyint(1) unsigned NOT NULL DEFAULT 0,
        PRIMARY KEY  (id),
        KEY user_id (user_id),
        KEY post_id (post_id),
        KEY viewed_at (viewed_at),
        KEY is_logged_in (is_logged_in),
        KEY page_path (page_path(191)),
        KEY referrer_url (referrer_url(191))
    ) {$charset_collate};";
    dbDelta( $sql );
}

add_action( 'init', 'fus_ensure_page_views_table' );

function fus_get_current_frontend_path() {
    $uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
    $path = $uri ? wp_parse_url( $uri, PHP_URL_PATH ) : '';
    $path = is_string( $path ) ? $path : '';
    return substr( $path, 0, 255 );
}

add_action( 'wp_ajax_nopriv_fus_track_public_view', function() {
    global $wpdb;
    fus_ensure_page_views_table();

    $table = $wpdb->prefix . 'fus_page_views';
    $time_spent = isset( $_POST['time_spent'] ) ? (int) $_POST['time_spent'] : 0;
    $time_spent = max( 0, min( 7200, $time_spent ) );
    $post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;

    $raw_title = isset( $_POST['page_title'] ) ? (string) wp_unslash( $_POST['page_title'] ) : '';
    $page_title = sanitize_text_field( $raw_title );
    $page_title = mb_substr( $page_title, 0, 255 );

    $raw_url = isset( $_POST['page_url'] ) ? (string) wp_unslash( $_POST['page_url'] ) : '';
    $page_url = esc_url_raw( $raw_url );
    $page_url = $page_url ? mb_substr( $page_url, 0, 2000 ) : '';

    $raw_referrer = isset( $_POST['referrer_url'] ) ? (string) wp_unslash( $_POST['referrer_url'] ) : '';
    $referrer_url = esc_url_raw( $raw_referrer );
    $referrer_url = $referrer_url ? mb_substr( $referrer_url, 0, 2000 ) : '';

    $raw_path = isset( $_POST['page_path'] ) ? (string) wp_unslash( $_POST['page_path'] ) : '';
    $page_path = sanitize_text_field( $raw_path );
    $page_path = $page_path ? mb_substr( $page_path, 0, 255 ) : fus_get_current_frontend_path();

    $wpdb->insert(
        $table,
        array(
            'user_id'      => 0,
            'post_id'      => $post_id,
            'post_title'   => $page_title,
            'page_url'     => $page_url,
            'referrer_url' => $referrer_url,
            'page_path'    => $page_path,
            'time_spent'   => $time_spent,
            'viewed_at'    => current_time( 'mysql' ),
            'is_logged_in' => 0,
        ),
        array( '%d', '%d', '%s', '%s', '%s', '%s', '%d', '%s', '%d' )
    );

    wp_send_json_success( array( 'tracked' => true ) );
} );

add_action( 'wp_ajax_fus_track_logged_in_view', function() {
    if ( ! is_user_logged_in() ) {
        wp_send_json_error( array( 'tracked' => false, 'message' => 'Unauthorized' ), 403 );
    }

    global $wpdb;
    fus_ensure_page_views_table();

    $user_id = get_current_user_id();
    if ( ! $user_id ) {
        wp_send_json_error( array( 'tracked' => false, 'message' => 'Invalid user' ), 400 );
    }

    $table = $wpdb->prefix . 'fus_page_views';
    $time_spent = isset( $_POST['time_spent'] ) ? (int) $_POST['time_spent'] : 0;
    $time_spent = max( 0, min( 7200, $time_spent ) );
    $post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;

    $raw_title = isset( $_POST['page_title'] ) ? (string) wp_unslash( $_POST['page_title'] ) : '';
    $page_title = sanitize_text_field( $raw_title );
    $page_title = mb_substr( $page_title, 0, 255 );

    $raw_url = isset( $_POST['page_url'] ) ? (string) wp_unslash( $_POST['page_url'] ) : '';
    $page_url = esc_url_raw( $raw_url );
    $page_url = $page_url ? mb_substr( $page_url, 0, 2000 ) : '';

    $raw_referrer = isset( $_POST['referrer_url'] ) ? (string) wp_unslash( $_POST['referrer_url'] ) : '';
    $referrer_url = esc_url_raw( $raw_referrer );
    $referrer_url = $referrer_url ? mb_substr( $referrer_url, 0, 2000 ) : '';

    $raw_path = isset( $_POST['page_path'] ) ? (string) wp_unslash( $_POST['page_path'] ) : '';
    $page_path = sanitize_text_field( $raw_path );
    $page_path = $page_path ? mb_substr( $page_path, 0, 255 ) : fus_get_current_frontend_path();

    $wpdb->insert(
        $table,
        array(
            'user_id'      => (int) $user_id,
            'post_id'      => $post_id,
            'post_title'   => $page_title,
            'page_url'     => $page_url,
            'referrer_url' => $referrer_url,
            'page_path'    => $page_path,
            'time_spent'   => $time_spent,
            'viewed_at'    => current_time( 'mysql' ),
            'is_logged_in' => 1,
        ),
        array( '%d', '%d', '%s', '%s', '%s', '%s', '%d', '%s', '%d' )
    );

    wp_send_json_success( array( 'tracked' => true ) );
} );

add_action( 'wp_footer', function() {
    if ( is_admin() || wp_doing_ajax() || wp_doing_cron() ) return;

    $post_id = 0;
    if ( is_singular() ) {
        $post_id = (int) get_queried_object_id();
    }

    $track_action = is_user_logged_in() ? 'fus_track_logged_in_view' : 'fus_track_public_view';
    $tracker_flag = is_user_logged_in() ? '__fusLoggedInTracked' : '__fusAnonTracked';
    $ajax_url = admin_url( 'admin-ajax.php' );
    echo "<script>
(function(){
  if (window.{$tracker_flag}) return;
  window.{$tracker_flag} = true;
  var startedAt = Date.now();
  var sent = false;
  function send(){
    if (sent) return;
    sent = true;
    var sec = Math.round((Date.now() - startedAt) / 1000);
    if (!isFinite(sec) || sec < 0) sec = 0;
    if (sec > 7200) sec = 7200;
    var payload = new URLSearchParams();
    payload.set('action', " . wp_json_encode( $track_action ) . ");
    payload.set('time_spent', String(sec));
    payload.set('post_id', " . (int) $post_id . ");
    payload.set('page_url', String(window.location.href || ''));
    payload.set('referrer_url', String(document.referrer || ''));
    payload.set('page_path', String(window.location.pathname || ''));
    payload.set('page_title', String(document.title || ''));
    if (navigator.sendBeacon) {
      navigator.sendBeacon(" . wp_json_encode( $ajax_url ) . ", payload);
    } else {
      fetch(" . wp_json_encode( $ajax_url ) . ", {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: payload.toString(),
        keepalive: true
      });
    }
  }
  window.addEventListener('pagehide', send);
  window.addEventListener('beforeunload', send);
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'hidden') send();
  });
})();
</script>";
}, 999 );

// ─────────────────────────────────────────────────────────────────
// 2. ADMIN MENU
// ─────────────────────────────────────────────────────────────────
add_action( 'admin_menu', function() {
    add_menu_page(
        'User Stats', 'User Stats', 'manage_options',
        'finnovate-user-stats', 'fus_render_page',
        'dashicons-chart-bar', 25
    );
});

// ─────────────────────────────────────────────────────────────────
// 3. ENQUEUE SCRIPTS & STYLES
// ─────────────────────────────────────────────────────────────────
add_action( 'admin_enqueue_scripts', function( $hook ) {
    if ( $hook !== 'toplevel_page_finnovate-user-stats' ) return;
    wp_enqueue_script( 'chart-js', 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', array(), '4.4.0', true );
    wp_enqueue_script( 'chart-js-adapter', 'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js', array('chart-js'), '3.0.0', true );
});

add_action( 'admin_head', function() {
    $screen = get_current_screen();
    if ( ! $screen || $screen->id !== 'toplevel_page_finnovate-user-stats' ) return;
    echo '<style>
    @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
    body.toplevel_page_finnovate-user-stats{background:radial-gradient(1200px 700px at 100% -10%, #eef5ff 0%, #f5f5f7 45%, #f5f5f7 100%);}
    body.toplevel_page_finnovate-user-stats #wpfooter{position:relative;z-index:1;}
    body.toplevel_page_finnovate-user-stats #wpbody-content{padding-bottom:88px;}
    #fus-wrap *{box-sizing:border-box;}
    #fus-wrap{
        --fus-bg:#f5f5f7;
        --fus-card:#ffffffd9;
        --fus-stroke:#d2d2d7;
        --fus-text:#1d1d1f;
        --fus-muted:#6e6e73;
        --fus-blue:#0071e3;
        --fus-blue-dark:#0058b0;
        max-width:1280px;
        margin:22px 20px 70px 0;
        font-family:"Inter",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;
        color:var(--fus-text);
    }
    #fus-wrap h1{font-size:31px;font-weight:700;margin:0 0 8px;letter-spacing:-0.03em;line-height:1.14;}
    .fus-subtitle{color:var(--fus-muted);font-size:13px;margin-bottom:24px;}
    .fus-subtitle a{color:var(--fus-blue);text-decoration:none;font-weight:600;}
    .fus-subtitle a:hover{text-decoration:underline;}

    .fus-tabs{display:flex;gap:6px;margin-bottom:22px;background:#ffffffa8;border:1px solid var(--fus-stroke);backdrop-filter:blur(20px);border-radius:14px;padding:4px;width:fit-content;}
    .fus-tab{padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;border:none;background:transparent;color:var(--fus-muted);transition:all .2s ease;text-decoration:none;}
    .fus-tab:hover{color:var(--fus-text);}
    .fus-tab.active{background:#fff;color:var(--fus-text);box-shadow:0 1px 2px rgba(0,0,0,.08),0 8px 24px rgba(0,0,0,.06);}

    .fus-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:12px;margin-bottom:22px;}
    .fus-card{
        background:var(--fus-card);
        border:1px solid #ffffffa3;
        border-radius:18px;
        padding:16px;
        box-shadow:0 1px 2px rgba(0,0,0,.04),0 14px 40px rgba(0,0,0,.06),inset 0 0 0 1px rgba(210,210,215,.35);
        cursor:pointer;transition:all .24s ease;text-decoration:none;display:block;position:relative;overflow:hidden;
        backdrop-filter:blur(18px);
    }
    .fus-card::before{content:"";position:absolute;inset:0;opacity:.11;background:linear-gradient(135deg,var(--card-accent,#d2d2d7),transparent 52%);}
    .fus-card::after{content:"";position:absolute;top:0;left:16px;right:16px;height:1px;background:rgba(255,255,255,.75);}
    .fus-card:hover{transform:translateY(-2px);box-shadow:0 2px 4px rgba(0,0,0,.06),0 18px 42px rgba(0,0,0,.08),inset 0 0 0 1px rgba(210,210,215,.55);}
    .fus-card.active{box-shadow:0 0 0 2px rgba(0,113,227,.14),0 18px 42px rgba(0,0,0,.08);}
    .fus-card .fus-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#808086;margin-bottom:10px;position:relative;}
    .fus-card .fus-number{font-size:34px;font-weight:700;line-height:.98;letter-spacing:-0.05em;color:var(--fus-text);position:relative;}
    .fus-card .fus-delta{margin-top:10px;font-size:11px;color:#808086;display:flex;align-items:center;gap:4px;position:relative;}
    .fus-card .fus-delta strong{color:#1f9c52;font-weight:700;}
    .fus-card .fus-delta strong.zero{color:#9d9da4;}
    .fus-card .fus-period-count{margin-top:6px;font-size:17px;font-weight:700;color:#4a4a4f;letter-spacing:-0.02em;display:none;position:relative;}
    .fus-card .fus-period-label{font-size:10px;color:#8e8e93;margin-top:2px;display:none;position:relative;}
    .fus-date-filtered .fus-card .fus-period-count,.fus-date-filtered .fus-card .fus-period-label{display:block;}
    .fus-date-filtered .fus-card .fus-delta{display:none;}

    .fus-card.fus-total{--card-accent:#0071e3;}
    .fus-card.fus-testing{--card-accent:#ff9f0a;}
    .fus-card.fus-internal{--card-accent:#5ac8fa;}
    .fus-card.fus-uploaded{--card-accent:#8e8e93;}
    .fus-card.fus-registered{--card-accent:#30b0c7;}
    .fus-card.fus-approved{--card-accent:#34c759;}
    .fus-card.fus-pending{--card-accent:#ff3b30;}

    .fus-filters,.fus-global-filter,.fus-trend-wrap{
        background:#ffffffc9;
        border:1px solid #ffffffa6;
        border-radius:16px;
        box-shadow:0 1px 2px rgba(0,0,0,.04),0 16px 38px rgba(0,0,0,.05),inset 0 0 0 1px rgba(210,210,215,.45);
        backdrop-filter:blur(20px);
    }
    .fus-filters{padding:14px 16px;margin-bottom:20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
    .fus-filters label,.fus-global-filter-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#86868b;}
    .fus-filters select,.fus-filters input[type=date],.fus-filters input[type=text],.fus-global-filter select,.fus-global-filter input[type=date]{
        font-size:13px;border:1px solid #d2d2d7;border-radius:10px;padding:7px 10px;color:var(--fus-text);background:#fff;
        font-family:"Inter",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;transition:all .18s ease;
    }
    .fus-filters select:focus,.fus-filters input:focus,.fus-global-filter select:focus,.fus-global-filter input[type=date]:focus{
        outline:none;border-color:var(--fus-blue);box-shadow:0 0 0 3px rgba(0,113,227,.15);
    }
    .fus-btn,.fus-btn-secondary,.fus-btn-csv{
        border-radius:980px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;
        font-family:"Inter",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;transition:all .16s ease;
    }
    .fus-btn{background:var(--fus-blue);color:#fff;border:none;}
    .fus-btn:hover{background:var(--fus-blue-dark);}
    .fus-btn-secondary{background:#fff;color:var(--fus-text);border:1px solid #d2d2d7;}
    .fus-btn-secondary:hover{border-color:#b4b4b8;background:#fafafa;}
    .fus-btn-csv{background:#fff;color:var(--fus-blue);border:1px solid rgba(0,113,227,.35);margin-left:auto;}
    .fus-btn-csv:hover{background:#eaf3ff;border-color:rgba(0,113,227,.5);}
    .fus-custom-dates{display:none;}
    .fus-custom-dates.visible{display:contents;}

    .fus-table-wrap{overflow-x:auto;border-radius:16px;border:1px solid #ffffffa3;box-shadow:0 1px 2px rgba(0,0,0,.03),0 18px 40px rgba(0,0,0,.05),inset 0 0 0 1px rgba(210,210,215,.45);background:#fff;}
    table.fus-table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;font-size:13px;}
    table.fus-table thead th{background:#f6f7f9;padding:11px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#86868b;border-bottom:1px solid #e6e6eb;white-space:nowrap;}
    table.fus-table thead th a{color:#7f7f84;text-decoration:none;display:inline-flex;align-items:center;gap:4px;transition:color .16s ease;}
    table.fus-table thead th a:hover,table.fus-table thead th.sorted a{color:var(--fus-blue);}
    .fus-zoho-sort-btn{appearance:none;-webkit-appearance:none;border:none;background:transparent;padding:0;margin:0;display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#86868b;cursor:pointer;}
    .fus-zoho-sort-btn:hover{color:var(--fus-blue);}
    .fus-zoho-sort-btn.active{color:var(--fus-blue);}
    .fus-zoho-sort-arrow{font-size:10px;line-height:1;color:#9ca3af;min-width:10px;text-align:center;}
    .fus-zoho-sort-btn.active .fus-zoho-sort-arrow{color:var(--fus-blue);}
    .sort-arrow{font-size:9px;opacity:.62;}
    table.fus-table tbody td{padding:12px 14px;color:var(--fus-text);border-bottom:1px solid #f0f1f4;vertical-align:middle;font-size:13px;}
    table.fus-table tbody tr:last-child td{border-bottom:none;}
    table.fus-table tbody tr:hover td{background:#f8fbff;}
    .fus-nil{color:#b2b2b8;font-style:italic;}
    .fus-mono{font-family:ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;font-size:12px;}
    .fus-status{display:inline-flex;align-items:center;padding:4px 10px;border-radius:980px;font-size:11px;font-weight:700;text-transform:capitalize;line-height:1;}
    .fus-status-approved{background:#e8f7ee;color:#1f9c52;border:1px solid #bfe6cb;}
    .fus-status-pending{background:#fff1ef;color:#d70015;border:1px solid #ffd1cc;}
    .fus-status-client{background:#eaf3ff;color:#0058b0;border:1px solid #bfdbfe;}
    .fus-status-lead{background:#fff7e8;color:#a16207;border:1px solid #fde68a;}
    .fus-status-unknown{background:#f4f4f5;color:#3f3f46;border:1px solid #e5e7eb;}

    .fus-pagination{display:flex;align-items:center;gap:6px;margin-top:16px;font-size:13px;flex-wrap:wrap;}
    .fus-pagination a,.fus-pagination strong{min-width:30px;text-align:center;padding:6px 10px;border:1px solid #d2d2d7;border-radius:10px;text-decoration:none;color:var(--fus-text);background:#fff;font-weight:600;transition:all .16s ease;}
    .fus-pagination a:hover{border-color:#b8b8be;background:#fafafa;}
    .fus-pagination strong{background:var(--fus-blue);color:#fff;border-color:var(--fus-blue);}
    .fus-pagination span{color:#7d7d84;margin-left:6px;font-size:12px;}

    .fus-modal{display:none;position:fixed;z-index:999999;left:0;top:0;width:100%;height:100%;background:rgba(29,29,31,.42);backdrop-filter:blur(10px);}
    .fus-modal-content{background:#ffffffdb;margin:5% auto;border-radius:20px;width:min(900px,88vw);position:relative;box-shadow:0 18px 50px rgba(0,0,0,.2);overflow:hidden;border:1px solid #ffffffb3;}
    .fus-modal-header{padding:20px 24px;border-bottom:1px solid #e7e7ec;display:flex;align-items:center;justify-content:space-between;}
    .fus-modal-header h2{margin:0;font-size:18px;font-weight:700;letter-spacing:-0.02em;}
    .fus-modal-body{padding:20px 24px 24px;}
    .fus-modal-close{width:30px;height:30px;border-radius:50%;border:1px solid #d7d7dc;background:#fff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;color:#6f6f75;transition:all .16s ease;}
    .fus-modal-close:hover{background:#f3f3f6;color:#1d1d1f;}
    .fus-chart-container{position:relative;height:380px;width:100%;}
    .fus-chart-meta{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;}
    .fus-chart-meta-item{background:#fff;border:1px solid #dfdfe4;border-radius:12px;padding:10px 14px;flex:1;min-width:120px;}
    .fus-chart-meta-item .fus-chart-meta-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#86868b;margin-bottom:4px;}
    .fus-chart-meta-item .fus-chart-meta-value{font-size:21px;font-weight:700;color:#1d1d1f;letter-spacing:-0.02em;}

    .fus-btn-graph{background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:8px;font-size:13px;color:#7d7d84;transition:all .16s ease;line-height:1;}
    .fus-btn-graph:hover{background:#eaf3ff;color:var(--fus-blue);}

    .fus-trend-header{padding:18px 20px;border-bottom:1px solid #e7e7ec;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}
    .fus-trend-header h2{margin:0;font-size:18px;font-weight:700;letter-spacing:-0.02em;}
    .fus-trend-period-btns{display:flex;gap:4px;background:#eef0f3;border:1px solid #d2d2d7;border-radius:980px;padding:3px;}
    .fus-trend-period-btn{padding:6px 13px;border:none;border-radius:980px;font-size:12px;font-weight:600;cursor:pointer;background:transparent;color:#6e6e73;transition:all .16s ease;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;}
    .fus-trend-period-btn.active{background:#fff;color:#1d1d1f;box-shadow:0 1px 2px rgba(0,0,0,.09);}
    .fus-trend-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;padding:16px 20px;border-bottom:1px solid #ececf0;}
    .fus-trend-stat-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8c8c92;margin-bottom:6px;}
    .fus-trend-stat-value{font-size:29px;font-weight:700;letter-spacing:-0.04em;color:#1d1d1f;}
    .fus-trend-stat-value.purple{color:#0071e3;}
    .fus-trend-stat-value.green{color:#1f9c52;}
    .fus-trend-chart{padding:16px 20px 20px;}
    .fus-trend-chart-container{position:relative;height:320px;width:100%;}
    .fus-trend-drill{margin-top:16px;background:#fff;border:1px solid #e6e6eb;border-radius:14px;overflow:hidden;}
    .fus-trend-drill-head{padding:12px 14px;border-bottom:1px solid #ececf0;font-size:13px;font-weight:700;color:#1d1d1f;display:flex;align-items:center;justify-content:space-between;gap:10px;}
    .fus-trend-drill-body{padding:0;}
    .fus-trend-drill-empty{padding:24px 14px;color:#6e6e73;font-size:13px;text-align:center;}
    .fus-trend-drill-pager{display:flex;gap:6px;align-items:center;justify-content:flex-end;padding:10px 12px;border-top:1px solid #ececf0;font-size:12px;color:#6e6e73;}
    .fus-trend-drill-pager button{border:1px solid #d2d2d7;background:#fff;color:#1d1d1f;border-radius:8px;padding:5px 9px;cursor:pointer;font-size:12px;}
    .fus-trend-drill-pager button:disabled{opacity:.45;cursor:not-allowed;}
    .fus-batch-actions{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;}
    .fus-batch-actions .fus-apple-select{
        min-width:220px;
        height:46px;
        padding:0 42px 0 16px;
        border:1.5px solid #b7bcc5;
        border-radius:10px;
        background-color:#fff;
        background-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2214%22%20height%3D%229%22%20viewBox%3D%220%200%2014%209%22%3E%3Cpath%20d%3D%22M1%201l6%206%206-6%22%20fill%3D%22none%22%20stroke%3D%22%23666%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E");
        background-repeat:no-repeat;
        background-position:right 14px center;
        background-size:14px 9px;
        color:#1f2937;
        font-size:13px;
        font-weight:500;
        line-height:1;
        appearance:none;
        -webkit-appearance:none;
        -moz-appearance:none;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.85);
        transition:border-color .16s ease, box-shadow .16s ease;
    }
    .fus-batch-actions .fus-apple-select:hover{border-color:#9ea4af;}
    .fus-batch-actions .fus-apple-select:focus{
        outline:none;
        border-color:#0071e3;
        box-shadow:0 0 0 3px rgba(0,113,227,.14), inset 0 1px 0 rgba(255,255,255,.85);
    }
    .fus-inline-msg{font-size:12px;color:#6e6e73;}
    .fus-zoho-badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid #e5e7eb;background:#f8fafc;color:#334155;}
    .fus-zoho-badge.client{background:#eaf3ff;color:#0058b0;border-color:#bfdbfe;}
    .fus-zoho-badge.lead{background:#fff7e8;color:#a16207;border-color:#fde68a;}
    .fus-zoho-badge.not_found{background:#f4f4f5;color:#3f3f46;border-color:#e5e7eb;}
    .fus-zoho-badge.error{background:#fff1ef;color:#b42318;border-color:#ffd1cc;}
    .fus-zoho-badge.pending{background:#f8fafc;color:#475569;border-color:#e2e8f0;}
    .fus-zoho-pill-row{display:flex;flex-wrap:wrap;gap:8px;margin:-4px 0 14px;}
    .fus-zoho-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid #d2d2d7;background:#fff;color:#334155;font-size:12px;font-weight:700;text-decoration:none;transition:all .16s ease;}
    .fus-zoho-pill:hover{border-color:#b4b4b8;background:#fafafa;}
    .fus-zoho-pill.active{box-shadow:0 0 0 2px rgba(0,113,227,.14);border-color:#93c5fd;background:#eff6ff;color:#1e3a8a;}
    .fus-apple-collapse{margin-bottom:14px;background:#ffffffc9;border:1px solid #ffffffa6;border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 16px 38px rgba(0,0,0,.05),inset 0 0 0 1px rgba(210,210,215,.45);backdrop-filter:blur(20px);overflow:hidden;}
    .fus-apple-collapse>summary{list-style:none;cursor:pointer;padding:14px 16px;font-size:14px;font-weight:700;color:#1d1d1f;display:flex;align-items:center;justify-content:space-between;}
    .fus-apple-collapse>summary::-webkit-details-marker{display:none;}
    .fus-apple-collapse>summary::after{content:"▾";font-size:12px;color:#6e6e73;transition:transform .16s ease;}
    .fus-apple-collapse[open]>summary::after{transform:rotate(180deg);}
    .fus-apple-collapse-body{padding:0 16px 16px;border-top:1px solid #ececf0;}
    .fus-zoho-oauth-note{margin:12px 0 14px;color:#6e6e73;font-size:13px;}
    .fus-zoho-oauth-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;}
    .fus-zoho-oauth-field{display:flex;flex-direction:column;gap:6px;}
    .fus-zoho-oauth-field.full{grid-column:1 / -1;}
    .fus-zoho-oauth-form label{
        font-size:12px;
        font-weight:700;
        letter-spacing:.02em;
        color:#6e6e73;
    }
    .fus-zoho-oauth-form input[type="text"],
    .fus-zoho-oauth-form input[type="url"],
    .fus-zoho-oauth-form input[type="password"]{
        width:100%;
        height:46px;
        border:1px solid #d2d2d7;
        border-radius:12px;
        padding:0 14px;
        background:linear-gradient(180deg,#fff 0%,#fbfbfd 100%);
        color:#1d1d1f;
        font-size:15px;
        line-height:1;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.85);
        transition:border-color .16s ease, box-shadow .16s ease, background-color .16s ease;
    }
    .fus-zoho-oauth-form input::placeholder{color:#8f8f95;}
    .fus-zoho-oauth-form input:hover{border-color:#b8b8be;background:#fff;}
    .fus-zoho-oauth-form input:focus{
        outline:none;
        border-color:#0071e3;
        box-shadow:0 0 0 3px rgba(0,113,227,.14), inset 0 1px 0 rgba(255,255,255,.85);
        background:#fff;
    }
    .fus-zoho-oauth-actions{grid-column:1 / -1;display:flex;gap:8px;align-items:center;}
    .fus-zoho-token-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:stretch;}
    .fus-zoho-token-card{
        min-width:170px;
        flex:1;
        background:#fff;
        border:1px solid #e5e7eb;
        border-radius:12px;
        padding:10px 12px;
        box-shadow:0 1px 1px rgba(0,0,0,.03);
    }
    .fus-zoho-token-card .label{font-size:11px;color:#6e6e73;text-transform:uppercase;font-weight:700;margin-bottom:4px;}
    .fus-zoho-token-card .value{font-size:14px;color:#1d1d1f;font-weight:600;}
    .fus-zoho-token-card.token{min-width:280px;flex:1.2;}
    .fus-zoho-refresh-form{margin-top:14px;}
    .fus-state-layout{display:grid;grid-template-columns:minmax(320px, 1fr) minmax(340px, 1fr);gap:18px;align-items:stretch;}
    .fus-state-chart-panel,.fus-state-table-panel{background:#ffffffc9;border:1px solid #ffffffa6;border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 16px 38px rgba(0,0,0,.05),inset 0 0 0 1px rgba(210,210,215,.45);backdrop-filter:blur(20px);}
    .fus-state-panel-header{padding:16px 18px;border-bottom:1px solid #ececf0;font-size:14px;font-weight:700;letter-spacing:-0.01em;color:#1d1d1f;}
    .fus-state-chart-wrap{padding:16px 18px;}
    .fus-state-chart-canvas-wrap{position:relative;height:360px;width:100%;}
    .fus-state-total{font-size:13px;color:#6e6e73;margin-bottom:12px;}
    .fus-leaderboard-wrap{display:flex;flex-direction:column;gap:14px;}
    .fus-leaderboard-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
    .fus-leaderboard-stat{background:#ffffffc9;border:1px solid #ffffffa6;border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 16px 38px rgba(0,0,0,.05),inset 0 0 0 1px rgba(210,210,215,.45);backdrop-filter:blur(20px);padding:16px;}
    .fus-leaderboard-stat-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8c8c92;margin-bottom:6px;}
    .fus-leaderboard-stat-value{font-size:30px;font-weight:700;letter-spacing:-0.04em;color:#1d1d1f;}
    .fus-rank-badge{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 8px;border-radius:999px;background:#f2f8ff;color:#0071e3;font-size:11px;font-weight:700;}
    .fus-rank-badge.top1{background:#fff7e0;color:#a16207;}
    .fus-rank-badge.top2{background:#f4f4f5;color:#3f3f46;}
    .fus-rank-badge.top3{background:#fff1eb;color:#b45309;}
    @media (max-width:1024px){.fus-state-layout{grid-template-columns:1fr;}.fus-leaderboard-stats{grid-template-columns:1fr;}}

    .fus-global-filter{padding:14px 16px;margin-bottom:18px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;}
    .fus-global-filter-sep{width:1px;height:24px;background:#d6d6dc;}
    .fus-filter-active-badge{background:#eaf3ff;color:var(--fus-blue);font-size:11px;font-weight:700;padding:5px 11px;border-radius:980px;letter-spacing:.02em;border:1px solid rgba(0,113,227,.22);}
    .fus-global-filter .fus-btn-clear{background:none;border:none;color:#7f7f84;font-size:12px;cursor:pointer;padding:0;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;text-decoration:underline;}
    .fus-global-filter .fus-btn-clear:hover{color:#d70015;}

    @media (max-width:900px){
      #fus-wrap{margin-right:10px;}
      .fus-global-filter,.fus-filters{gap:8px;}
      .fus-grid{grid-template-columns:repeat(auto-fill,minmax(145px,1fr));}
      .fus-card .fus-number{font-size:30px;}
      .fus-modal-content{width:95vw;margin:8% auto;}
      .fus-trend-header,.fus-trend-stats,.fus-trend-chart{padding-left:14px;padding-right:14px;}
    }
    </style>';
});

// ─────────────────────────────────────────────────────────────────
// 4. STAT COUNTS
// ─────────────────────────────────────────────────────────────────

/**
 * Get cumulative stats up to an optional end date.
 * $date_to = 'Y-m-d' string or '' for all-time (today).
 */
function fus_get_stats( $date_to = '', $include_internal = true ) {
    global $wpdb;
    $s = array();

    // Cumulative cutoff — everything registered up to end of $date_to
    $cutoff = $date_to ? $wpdb->prepare( "AND u.user_registered <= %s", $date_to . ' 23:59:59' ) : '';
    $internal_where = fus_is_segment_effective_where_sql( 'internal', 'u' );
    $exclude_internal = $include_internal ? '' : " AND NOT ( {$internal_where} )";

    $s['total'] = (int) $wpdb->get_var(
        "SELECT COUNT(ID) FROM {$wpdb->users} u WHERE 1=1 {$cutoff} {$exclude_internal}"
    );

    $testing_where  = fus_is_segment_effective_where_sql( 'testing', 'u' );
    $registered_where = fus_is_segment_effective_where_sql( 'registered', 'u' );
    $approved_where   = fus_is_segment_effective_where_sql( 'approved', 'u' );
    $pending_where    = fus_is_segment_effective_where_sql( 'pending', 'u' );

    $s['internal'] = $include_internal ? (int) $wpdb->get_var(
        "SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$internal_where} {$cutoff}"
    ) : 0;

    $s['testing'] = (int) $wpdb->get_var(
        "SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$testing_where} {$cutoff} {$exclude_internal}"
    );

    // Uploaded = zero-date, no cutoff relevant (still respects include_internal)
    $s['uploaded'] = (int) $wpdb->get_var(
        "SELECT COUNT(ID) FROM {$wpdb->users} u WHERE u.user_registered = '0000-00-00 00:00:00' {$exclude_internal}"
    );

    $s['registered'] = (int) $wpdb->get_var(
        "SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$registered_where} {$cutoff} {$exclude_internal}"
    );

    $s['approved'] = (int) $wpdb->get_var(
        "SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$approved_where} {$cutoff} {$exclude_internal}"
    );

    $s['pending'] = (int) $wpdb->get_var(
        "SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$pending_where} {$cutoff} {$exclude_internal}"
    );
    return $s;
}

/**
 * Get count of users added WITHIN a date range (new in period).
 * Both $date_from and $date_to are 'Y-m-d' strings.
 */
function fus_get_stats_in_period( $date_from, $date_to, $include_internal = true ) {
    global $wpdb;
    $s = array();

    $date_where_plain = $wpdb->prepare(
        "user_registered != '0000-00-00 00:00:00' AND user_registered >= %s AND user_registered <= %s",
        $date_from . ' 00:00:00', $date_to . ' 23:59:59'
    );
    $date_where = $wpdb->prepare(
        "u.user_registered != '0000-00-00 00:00:00' AND u.user_registered >= %s AND u.user_registered <= %s",
        $date_from . ' 00:00:00', $date_to . ' 23:59:59'
    );
    $internal_where   = fus_is_segment_effective_where_sql( 'internal', 'u' );
    $exclude_internal = $include_internal ? '' : " AND NOT ( {$internal_where} )";
    $testing_where    = fus_is_segment_effective_where_sql( 'testing', 'u' );
    $registered_where = fus_is_segment_effective_where_sql( 'registered', 'u' );
    $approved_where   = fus_is_segment_effective_where_sql( 'approved', 'u' );
    $pending_where    = fus_is_segment_effective_where_sql( 'pending', 'u' );

    $s['total']    = (int) $wpdb->get_var( "SELECT COUNT(ID) FROM {$wpdb->users} u WHERE {$date_where_plain} {$exclude_internal}" );
    $s['internal'] = $include_internal ? (int) $wpdb->get_var( "SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$date_where} AND {$internal_where}" ) : 0;
    $s['testing']  = (int) $wpdb->get_var( "SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$date_where} AND {$testing_where} {$exclude_internal}" );
    $s['uploaded']    = 0; // uploaded users have no valid date
    $s['registered']  = (int) $wpdb->get_var( "SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$date_where} AND {$registered_where} {$exclude_internal}" );
    $s['approved']    = (int) $wpdb->get_var( "SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$date_where} AND {$approved_where} {$exclude_internal}" );
    $s['pending']     = (int) $wpdb->get_var( "SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$date_where} AND {$pending_where} {$exclude_internal}" );
    return $s;
}

function fus_get_stats_deltas( $days = 7, $include_internal = true ) {
    global $wpdb;
    $days      = max( 1, (int) $days );
    $date_from = gmdate( 'Y-m-d 00:00:00', strtotime( '-' . ($days-1) . ' days' ) );
    $date_to   = gmdate( 'Y-m-d 23:59:59' );
    $date_where = $wpdb->prepare(
        "u.user_registered != '0000-00-00 00:00:00' AND u.user_registered >= %s AND u.user_registered <= %s",
        $date_from, $date_to
    );
    $internal_where   = fus_is_segment_effective_where_sql( 'internal', 'u' );
    $exclude_internal = $include_internal ? '' : " AND NOT ( {$internal_where} )";
    $testing_where    = fus_is_segment_effective_where_sql( 'testing', 'u' );
    $registered_where = fus_is_segment_effective_where_sql( 'registered', 'u' );
    $approved_where   = fus_is_segment_effective_where_sql( 'approved', 'u' );
    $pending_where    = fus_is_segment_effective_where_sql( 'pending', 'u' );
    $d = array();

    $d['total']    = (int) $wpdb->get_var("SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$date_where} {$exclude_internal}");
    $d['internal'] = $include_internal ? (int) $wpdb->get_var("SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$date_where} AND {$internal_where}") : 0;
    $d['testing']  = (int) $wpdb->get_var("SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$date_where} AND {$testing_where} {$exclude_internal}");
    $d['uploaded']    = 0;
    $d['registered']  = (int) $wpdb->get_var("SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$date_where} AND {$registered_where} {$exclude_internal}");
    $d['approved']    = (int) $wpdb->get_var("SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$date_where} AND {$approved_where} {$exclude_internal}");
    $d['pending']     = (int) $wpdb->get_var("SELECT COUNT(DISTINCT u.ID) FROM {$wpdb->users} u WHERE {$date_where} AND {$pending_where} {$exclude_internal}");
    return $d;
}

/**
 * Get registered production user counts by state council.
 */
function fus_get_state_counts( $date_from = '', $date_to = '' ) {
    global $wpdb;
    $registered_where = fus_is_segment_effective_where_sql( 'registered', 'u' );

    $wheres = array(
        $registered_where,
        "st.meta_value IS NOT NULL",
        "TRIM(st.meta_value) != ''",
    );
    if ($date_from) $wheres[] = $wpdb->prepare("u.user_registered >= %s", $date_from . ' 00:00:00');
    if ($date_to)   $wheres[] = $wpdb->prepare("u.user_registered <= %s", $date_to   . ' 23:59:59');

    $where_sql = 'WHERE ' . implode(' AND ', $wheres);

    return $wpdb->get_results(
        "SELECT TRIM(st.meta_value) AS state, COUNT(DISTINCT u.ID) AS cnt
         FROM {$wpdb->users} u
         INNER JOIN {$wpdb->usermeta} st ON st.user_id = u.ID AND st.meta_key = '" . FUS_STATE_META . "'
         {$where_sql}
         GROUP BY TRIM(st.meta_value)
         ORDER BY cnt DESC, state ASC"
    );
}

function fus_format_seconds( $seconds ) {
    $seconds = max( 0, (int) round( $seconds ) );
    $h = floor( $seconds / 3600 );
    $m = floor( ( $seconds % 3600 ) / 60 );
    $s = $seconds % 60;
    return sprintf( '%02d:%02d:%02d', $h, $m, $s );
}

function fus_get_leaderboard_users( $date_from = '', $date_to = '', $page = 1, $per_page = 20, $include_internal = true ) {
    global $wpdb;
    $activity_table = $wpdb->prefix . 'fus_page_views';
    $table_exists = ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $activity_table)) === $activity_table);
    if (!$table_exists) {
        return array('total' => 0, 'rows' => array());
    }

    $wheres = array( "pv.user_id > 0" );
    if ( $date_from ) $wheres[] = $wpdb->prepare( "pv.viewed_at >= %s", $date_from . ' 00:00:00' );
    if ( $date_to )   $wheres[] = $wpdb->prepare( "pv.viewed_at <= %s", $date_to   . ' 23:59:59' );
    if ( ! $include_internal ) {
        $internal_where = fus_is_segment_effective_where_sql( 'internal', 'u' );
        $wheres[] = "(u.ID IS NULL OR NOT ( {$internal_where} ))";
    }
    $where_sql = 'WHERE ' . implode( ' AND ', $wheres );

    $offset = max( 0, ( (int) $page - 1 ) * (int) $per_page );
    $limit_sql = $wpdb->prepare( "LIMIT %d OFFSET %d", (int) $per_page, (int) $offset );

    $total = (int) $wpdb->get_var(
        "SELECT COUNT(*) FROM (
            SELECT pv.user_id
            FROM {$activity_table} pv
            LEFT JOIN {$wpdb->users} u ON u.ID = pv.user_id
            {$where_sql}
            GROUP BY pv.user_id
        ) x"
    );

    $rows = $wpdb->get_results(
        "SELECT
            pv.user_id AS user_id,
            COALESCE(NULLIF(u.display_name, ''), CONCAT('User #', pv.user_id, ' (Deleted)')) AS display_name,
            COALESCE(u.user_email, '') AS user_email,
            COUNT(*) AS total_views,
            SUM(COALESCE(pv.time_spent, 0)) AS total_time_spent,
            AVG(NULLIF(pv.time_spent, 0)) AS avg_time_spent,
            MAX(pv.viewed_at) AS last_viewed_at
         FROM {$activity_table} pv
         LEFT JOIN {$wpdb->users} u ON u.ID = pv.user_id
         {$where_sql}
         GROUP BY pv.user_id, u.display_name, u.user_email
         ORDER BY total_views DESC, total_time_spent DESC, last_viewed_at DESC
         {$limit_sql}"
    );

    return array(
        'total' => $total,
        'rows'  => $rows,
    );
}

function fus_get_leaderboard_summary( $date_from = '', $date_to = '', $include_internal = true ) {
    global $wpdb;
    $activity_table = $wpdb->prefix . 'fus_page_views';
    $table_exists = ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $activity_table)) === $activity_table);
    if (!$table_exists) {
        return array('total_views' => 0, 'total_time_spent' => 0, 'unique_users' => 0);
    }

    $wheres = array( "pv.user_id > 0" );
    if ( $date_from ) $wheres[] = $wpdb->prepare( "pv.viewed_at >= %s", $date_from . ' 00:00:00' );
    if ( $date_to )   $wheres[] = $wpdb->prepare( "pv.viewed_at <= %s", $date_to   . ' 23:59:59' );
    if ( ! $include_internal ) {
        $internal_where = fus_is_segment_effective_where_sql( 'internal', 'u' );
        $wheres[] = "(u.ID IS NULL OR NOT ( {$internal_where} ))";
    }
    $where_sql = 'WHERE ' . implode( ' AND ', $wheres );

    $row = $wpdb->get_row(
        "SELECT
            COUNT(*) AS total_views,
            SUM(COALESCE(pv.time_spent, 0)) AS total_time_spent,
            COUNT(DISTINCT pv.user_id) AS unique_users
         FROM {$activity_table} pv
         LEFT JOIN {$wpdb->users} u ON u.ID = pv.user_id
         {$where_sql}"
    );

    return array(
        'total_views'      => (int) ( isset( $row->total_views ) ? $row->total_views : 0 ),
        'total_time_spent' => (int) ( isset( $row->total_time_spent ) ? $row->total_time_spent : 0 ),
        'unique_users'     => (int) ( isset( $row->unique_users ) ? $row->unique_users : 0 ),
    );
}

function fus_get_postlogin_summary( $date_from = '', $date_to = '' ) {
    global $wpdb;
    $activity_table = $wpdb->prefix . 'fus_page_views';
    $table_exists = ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $activity_table)) === $activity_table);
    if (!$table_exists) {
        return array(
            'total_views' => 0,
            'unique_users' => 0,
            'avg_time_view' => 0,
            'views_per_user' => 0,
            'avg_time_user' => 0,
            'views_last_24h' => 0,
        );
    }

    $w = array( "pv.user_id > 0" );
    if ( $date_from ) $w[] = $wpdb->prepare( "pv.viewed_at >= %s", $date_from . ' 00:00:00' );
    if ( $date_to )   $w[] = $wpdb->prepare( "pv.viewed_at <= %s", $date_to   . ' 23:59:59' );
    $where_sql = 'WHERE ' . implode( ' AND ', $w );

    $row = $wpdb->get_row(
        "SELECT
            COUNT(*) AS total_views,
            COUNT(DISTINCT pv.user_id) AS unique_users,
            SUM(COALESCE(pv.time_spent, 0)) AS total_time_spent,
            AVG(NULLIF(pv.time_spent, 0)) AS avg_time_view
         FROM {$activity_table} pv
         {$where_sql}"
    );

    $total_views = (int) ( isset( $row->total_views ) ? $row->total_views : 0 );
    $unique_users = (int) ( isset( $row->unique_users ) ? $row->unique_users : 0 );
    $total_time_spent = (int) ( isset( $row->total_time_spent ) ? $row->total_time_spent : 0 );
    $avg_time_view = (float) ( isset( $row->avg_time_view ) ? $row->avg_time_view : 0 );

    $views_last_24h = (int) $wpdb->get_var( $wpdb->prepare(
        "SELECT COUNT(*) FROM {$activity_table} pv
         WHERE pv.user_id > 0 AND pv.viewed_at >= %s",
        gmdate( 'Y-m-d H:i:s', strtotime( '-24 hours' ) )
    ) );

    return array(
        'total_views' => $total_views,
        'unique_users' => $unique_users,
        'avg_time_view' => round( $avg_time_view, 1 ),
        'views_per_user' => $unique_users > 0 ? round( $total_views / $unique_users, 2 ) : 0,
        'avg_time_user' => $unique_users > 0 ? round( $total_time_spent / $unique_users, 1 ) : 0,
        'views_last_24h' => $views_last_24h,
    );
}

function fus_get_postlogin_top_posts( $date_from = '', $date_to = '', $limit = 20 ) {
    global $wpdb;
    $activity_table = $wpdb->prefix . 'fus_page_views';
    $table_exists = ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $activity_table)) === $activity_table);
    if (!$table_exists) return array();

    $limit = max( 1, min( 100, (int) $limit ) );
    $w = array( "pv.user_id > 0", "pv.post_id > 0" );
    if ( $date_from ) $w[] = $wpdb->prepare( "pv.viewed_at >= %s", $date_from . ' 00:00:00' );
    if ( $date_to )   $w[] = $wpdb->prepare( "pv.viewed_at <= %s", $date_to   . ' 23:59:59' );
    $where_sql = 'WHERE ' . implode( ' AND ', $w );

    return $wpdb->get_results(
        "SELECT
            pv.post_id,
            COALESCE(NULLIF(pv.post_title,''), '(Untitled)') AS post_title,
            COUNT(*) AS views,
            COUNT(DISTINCT pv.user_id) AS unique_users,
            AVG(NULLIF(pv.time_spent, 0)) AS avg_time,
            MAX(pv.viewed_at) AS last_seen
         FROM {$activity_table} pv
         {$where_sql}
         GROUP BY pv.post_id, post_title
         ORDER BY views DESC, last_seen DESC
         " . $wpdb->prepare( 'LIMIT %d', $limit )
    );
}

function fus_get_postlogin_recent_views( $date_from = '', $date_to = '', $limit = 50 ) {
    global $wpdb;
    $activity_table = $wpdb->prefix . 'fus_page_views';
    $table_exists = ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $activity_table)) === $activity_table);
    if (!$table_exists) return array();

    $limit = max( 1, min( 100, (int) $limit ) );
    $w = array( "pv.user_id > 0" );
    if ( $date_from ) $w[] = $wpdb->prepare( "pv.viewed_at >= %s", $date_from . ' 00:00:00' );
    if ( $date_to )   $w[] = $wpdb->prepare( "pv.viewed_at <= %s", $date_to   . ' 23:59:59' );
    $where_sql = 'WHERE ' . implode( ' AND ', $w );

    return $wpdb->get_results(
        "SELECT
            pv.user_id,
            COALESCE(NULLIF(u.display_name,''), CONCAT('User #', pv.user_id)) AS display_name,
            COALESCE(u.user_email, '') AS user_email,
            COALESCE(NULLIF(pv.post_title,''), '(Untitled)') AS post_title,
            pv.time_spent,
            pv.viewed_at
         FROM {$activity_table} pv
         LEFT JOIN {$wpdb->users} u ON u.ID = pv.user_id
         {$where_sql}
         ORDER BY pv.viewed_at DESC
         " . $wpdb->prepare( 'LIMIT %d', $limit )
    );
}

function fus_get_prelogin_summary( $date_from = '', $date_to = '' ) {
    global $wpdb;
    $activity_table = $wpdb->prefix . 'fus_page_views';
    $table_exists = ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $activity_table)) === $activity_table);
    if (!$table_exists) {
        return array(
            'total_views' => 0,
            'unique_pages' => 0,
            'avg_time_spent' => 0,
            'signup_views' => 0,
            'login_views' => 0,
            'views_last_24h' => 0,
        );
    }

    $w = array( "pv.user_id = 0" );
    if ( $date_from ) $w[] = $wpdb->prepare( "pv.viewed_at >= %s", $date_from . ' 00:00:00' );
    if ( $date_to )   $w[] = $wpdb->prepare( "pv.viewed_at <= %s", $date_to   . ' 23:59:59' );
    $where_sql = 'WHERE ' . implode( ' AND ', $w );

    $row = $wpdb->get_row(
        "SELECT
            COUNT(*) AS total_views,
            COUNT(DISTINCT COALESCE(NULLIF(pv.page_path,''), NULLIF(pv.post_title,''), CONCAT('post#', pv.post_id), NULLIF(pv.page_url,''))) AS unique_pages,
            AVG(NULLIF(pv.time_spent, 0)) AS avg_time_spent
         FROM {$activity_table} pv
         {$where_sql}"
    );

    $signup_views = (int) $wpdb->get_var(
        "SELECT COUNT(*) FROM {$activity_table} pv
         {$where_sql}
         AND (
            LOWER(pv.page_path) LIKE '%signup%' OR
            LOWER(pv.page_path) LIKE '%sign-up%' OR
            LOWER(pv.page_path) LIKE '%register%' OR
            LOWER(pv.page_path) LIKE '%registration%'
         )"
    );
    $login_views = (int) $wpdb->get_var(
        "SELECT COUNT(*) FROM {$activity_table} pv
         {$where_sql}
         AND (
            LOWER(pv.page_path) LIKE '%login%' OR
            LOWER(pv.page_path) LIKE '%signin%' OR
            LOWER(pv.page_path) LIKE '%sign-in%' OR
            LOWER(pv.page_path) LIKE '%wp-login%'
         )"
    );
    $views_last_24h = (int) $wpdb->get_var( $wpdb->prepare(
        "SELECT COUNT(*) FROM {$activity_table} pv
         WHERE pv.user_id = 0 AND pv.viewed_at >= %s",
        gmdate( 'Y-m-d H:i:s', strtotime( '-24 hours' ) )
    ) );

    return array(
        'total_views'    => (int) ( isset( $row->total_views ) ? $row->total_views : 0 ),
        'unique_pages'   => (int) ( isset( $row->unique_pages ) ? $row->unique_pages : 0 ),
        'avg_time_spent' => (int) round( (float) ( isset( $row->avg_time_spent ) ? $row->avg_time_spent : 0 ) ),
        'signup_views'   => $signup_views,
        'login_views'    => $login_views,
        'views_last_24h' => $views_last_24h,
    );
}

function fus_get_prelogin_top_pages( $limit = 30 ) {
    global $wpdb;
    $activity_table = $wpdb->prefix . 'fus_page_views';
    $table_exists = ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $activity_table)) === $activity_table);
    if (!$table_exists) return array();

    $limit = max( 1, min( 100, (int) $limit ) );
    return $wpdb->get_results(
        "SELECT
            COALESCE(NULLIF(pv.post_title,''), '(Untitled)') AS page_title,
            COALESCE(NULLIF(pv.page_path,''), NULLIF(pv.page_url,''), CONCAT('post#', pv.post_id), '(unknown)') AS page_path,
            COUNT(*) AS views,
            AVG(NULLIF(pv.time_spent, 0)) AS avg_time,
            MAX(pv.viewed_at) AS last_seen
         FROM {$activity_table} pv
         WHERE pv.user_id = 0
         GROUP BY page_title, page_path
         ORDER BY views DESC, last_seen DESC
         " . $wpdb->prepare( 'LIMIT %d', $limit )
    );
}

function fus_get_prelogin_recent_views( $limit = 50 ) {
    global $wpdb;
    $activity_table = $wpdb->prefix . 'fus_page_views';
    $table_exists = ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $activity_table)) === $activity_table);
    if (!$table_exists) return array();

    $limit = max( 1, min( 100, (int) $limit ) );
    return $wpdb->get_results(
        "SELECT
            COALESCE(NULLIF(pv.post_title,''), '(Untitled)') AS page_title,
            COALESCE(NULLIF(pv.page_path,''), NULLIF(pv.page_url,''), CONCAT('post#', pv.post_id), '(unknown)') AS page_path,
            pv.time_spent,
            pv.viewed_at
         FROM {$activity_table} pv
         WHERE pv.user_id = 0
         ORDER BY pv.viewed_at DESC
         " . $wpdb->prepare( 'LIMIT %d', $limit )
    );
}

function fus_get_prelogin_top_referrers( $limit = 20 ) {
    global $wpdb;
    $activity_table = $wpdb->prefix . 'fus_page_views';
    $table_exists = ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $activity_table)) === $activity_table);
    if (!$table_exists) return array();

    $limit = max( 1, min( 100, (int) $limit ) );
    return $wpdb->get_results(
        "SELECT
            CASE
                WHEN pv.referrer_url IS NULL OR pv.referrer_url = '' THEN '(Direct / Unknown)'
                ELSE LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(pv.referrer_url, '://', -1), '/', 1))
            END AS referrer,
            COUNT(*) AS views,
            COUNT(DISTINCT COALESCE(NULLIF(pv.page_path,''), NULLIF(pv.page_url,''), CONCAT('post#', pv.post_id), '(unknown)')) AS landing_pages,
            AVG(NULLIF(pv.time_spent, 0)) AS avg_time,
            MAX(pv.viewed_at) AS last_seen
         FROM {$activity_table} pv
         WHERE pv.user_id = 0
         GROUP BY referrer
         ORDER BY views DESC, last_seen DESC
         " . $wpdb->prepare( 'LIMIT %d', $limit )
    );
}

// ─────────────────────────────────────────────────────────────────
// 4B. LEARNPRESS COURSE HELPERS
// ─────────────────────────────────────────────────────────────────
function fus_lp_is_available() {
    return class_exists( 'LearnPress' ) || function_exists( 'learn_press_get_user' ) || function_exists( 'LP' );
}

function fus_lp_table_exists( $table_name ) {
    global $wpdb;
    static $cache = array();
    if ( isset( $cache[ $table_name ] ) ) return $cache[ $table_name ];
    $cache[ $table_name ] = ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table_name ) ) === $table_name );
    return $cache[ $table_name ];
}

function fus_lp_get_table_columns( $table_name ) {
    global $wpdb;
    static $cache = array();
    if ( isset( $cache[ $table_name ] ) ) return $cache[ $table_name ];
    if ( ! fus_lp_table_exists( $table_name ) ) {
        $cache[ $table_name ] = array();
        return $cache[ $table_name ];
    }
    $rows = $wpdb->get_results( "SHOW COLUMNS FROM {$table_name}" );
    $cols = array();
    if ( $rows ) {
        foreach ( $rows as $row ) {
            if ( ! empty( $row->Field ) ) $cols[] = (string) $row->Field;
        }
    }
    $cache[ $table_name ] = $cols;
    return $cache[ $table_name ];
}

function fus_lp_column_exists( $columns, $name ) {
    return in_array( (string) $name, (array) $columns, true );
}

function fus_lp_date_from_time( $v ) {
    if ( ! is_string( $v ) || $v === '' || $v === '0000-00-00 00:00:00' || $v === '0000-00-00' ) return '';
    $ts = strtotime( $v );
    if ( ! $ts ) return '';
    return date( 'Y-m-d', $ts );
}

function fus_lp_date_in_range( $v, $date_from = '', $date_to = '' ) {
    $d = fus_lp_date_from_time( $v );
    if ( $d === '' ) return false;
    if ( $date_from && $d < $date_from ) return false;
    if ( $date_to && $d > $date_to ) return false;
    return true;
}

function fus_lp_apply_date_filter_sql( $alias, $date_from = '', $date_to = '', $candidate_columns = array() ) {
    global $wpdb;
    if ( ! $date_from && ! $date_to ) return '';

    $usable = array();
    foreach ( (array) $candidate_columns as $col ) {
        $col = (string) $col;
        if ( preg_match( '/^[A-Za-z0-9_]+$/', $col ) ) $usable[] = $col;
    }
    if ( empty( $usable ) ) return '';

    $coalesced = array();
    foreach ( $usable as $col ) {
        $coalesced[] = "NULLIF({$alias}.{$col}, '0000-00-00 00:00:00')";
    }
    $date_expr = 'COALESCE(' . implode( ',', $coalesced ) . ')';

    $clauses = array();
    if ( $date_from ) $clauses[] = $wpdb->prepare( "{$date_expr} >= %s", $date_from . ' 00:00:00' );
    if ( $date_to )   $clauses[] = $wpdb->prepare( "{$date_expr} <= %s", $date_to . ' 23:59:59' );
    if ( empty( $clauses ) ) return '';

    return ' AND ' . implode( ' AND ', $clauses );
}

function fus_lp_progress_from_record( $record ) {
    static $meta_cache = array();
    global $wpdb;

    $progress = null;
    if ( is_object( $record ) ) {
        foreach ( array( 'progress', 'progress_percent' ) as $pk ) {
            if ( isset( $record->$pk ) && $record->$pk !== '' && $record->$pk !== null ) {
                $progress = (float) $record->$pk;
                break;
            }
        }
    }

    if ( $progress === null && is_object( $record ) && isset( $record->result ) && $record->result !== '' ) {
        $progress = (float) $record->result;
    }

    if ( $progress === null && is_object( $record ) && ! empty( $record->user_item_id ) ) {
        $user_item_id = (int) $record->user_item_id;
        if ( isset( $meta_cache[ $user_item_id ] ) ) {
            $progress = $meta_cache[ $user_item_id ];
        } else {
            $uim_table = $wpdb->prefix . 'learnpress_user_itemmeta';
            if ( fus_lp_table_exists( $uim_table ) ) {
                $uim_cols = fus_lp_get_table_columns( $uim_table );
                $uim_fk = fus_lp_column_exists( $uim_cols, 'learnpress_user_item_id' ) ? 'learnpress_user_item_id' : ( fus_lp_column_exists( $uim_cols, 'user_item_id' ) ? 'user_item_id' : '' );
                $uim_pk = fus_lp_column_exists( $uim_cols, 'meta_id' ) ? 'meta_id' : ( fus_lp_column_exists( $uim_cols, 'umeta_id' ) ? 'umeta_id' : '' );
                $meta_val = null;
                if ( $uim_fk ) {
                    $order_by = $uim_pk ? "ORDER BY {$uim_pk} DESC" : '';
                    $meta_val = $wpdb->get_var( $wpdb->prepare(
                        "SELECT meta_value FROM {$uim_table} WHERE {$uim_fk} = %d AND meta_key IN ('_lp_course_result','_lp_course_progress') {$order_by} LIMIT 1",
                        $user_item_id
                    ) );
                }
                $parsed = 0;
                if ( $meta_val !== null && $meta_val !== '' ) {
                    $decoded = maybe_unserialize( $meta_val );
                    if ( is_array( $decoded ) ) {
                        if ( isset( $decoded['result'] ) && is_numeric( $decoded['result'] ) ) {
                            $parsed = (float) $decoded['result'];
                        } elseif ( isset( $decoded['progress'] ) && is_numeric( $decoded['progress'] ) ) {
                            $parsed = (float) $decoded['progress'];
                        } elseif ( isset( $decoded['completed_items'], $decoded['count_items'] ) && (float) $decoded['count_items'] > 0 ) {
                            $parsed = ( (float) $decoded['completed_items'] / (float) $decoded['count_items'] ) * 100;
                        }
                    } elseif ( is_numeric( $decoded ) ) {
                        $parsed = (float) $decoded;
                    } elseif ( is_string( $decoded ) ) {
                        $j = json_decode( $decoded, true );
                        if ( is_array( $j ) && isset( $j['result'] ) && is_numeric( $j['result'] ) ) {
                            $parsed = (float) $j['result'];
                        }
                    }
                }
                $progress = $parsed;
                $meta_cache[ $user_item_id ] = $parsed;
            }
        }
    }

    if ( $progress === null ) $progress = 0;
    if ( $progress > 0 && $progress <= 1 ) $progress = $progress * 100;

    $status = is_object( $record ) && isset( $record->status ) ? strtolower( trim( (string) $record->status ) ) : '';
    $graduation = is_object( $record ) && isset( $record->graduation ) ? strtolower( trim( (string) $record->graduation ) ) : '';
    if ( in_array( $status, array( 'completed', 'finished', 'passed' ), true ) || in_array( $graduation, array( 'completed', 'finished', 'passed' ), true ) ) {
        $progress = max( $progress, 100 );
    } elseif ( $progress <= 0 && is_object( $record ) && ! empty( $record->started_at ) && $record->started_at !== '0000-00-00 00:00:00' ) {
        $progress = 1;
    }

    return max( 0, min( 100, (float) $progress ) );
}

function fus_get_courses_summary( $date_from = '', $date_to = '' ) {
    global $wpdb;
    $summary = array(
        'totals' => array(
            'courses' => 0,
            'enrolled' => 0,
            'started' => 0,
            'completed' => 0,
        ),
        'rows' => array(),
        'note' => '',
    );

    if ( ! fus_lp_is_available() ) {
        $summary['note'] = 'LearnPress not detected.';
        return $summary;
    }

    $user_items_table = $wpdb->prefix . 'learnpress_user_items';
    if ( ! fus_lp_table_exists( $user_items_table ) ) {
        $summary['note'] = 'LearnPress data tables not found.';
        return $summary;
    }

    $ui_cols = fus_lp_get_table_columns( $user_items_table );
    $item_pk = fus_lp_column_exists( $ui_cols, 'user_item_id' ) ? 'user_item_id' : ( fus_lp_column_exists( $ui_cols, 'id' ) ? 'id' : '' );
    $course_col = fus_lp_column_exists( $ui_cols, 'item_id' ) ? 'item_id' : '';
    $user_col = fus_lp_column_exists( $ui_cols, 'user_id' ) ? 'user_id' : '';
    if ( ! $item_pk || ! $course_col || ! $user_col ) {
        $summary['note'] = 'LearnPress table schema is not compatible.';
        return $summary;
    }

    $status_col = fus_lp_column_exists( $ui_cols, 'status' ) ? 'status' : '';
    $grad_col = fus_lp_column_exists( $ui_cols, 'graduation' ) ? 'graduation' : '';
    $start_col = fus_lp_column_exists( $ui_cols, 'start_time' ) ? 'start_time' : '';
    $end_col = fus_lp_column_exists( $ui_cols, 'end_time' ) ? 'end_time' : '';
    $created_col = fus_lp_column_exists( $ui_cols, 'created_at' ) ? 'created_at' : '';
    $updated_col = fus_lp_column_exists( $ui_cols, 'updated_at' ) ? 'updated_at' : '';
    $item_type_col = fus_lp_column_exists( $ui_cols, 'item_type' ) ? 'item_type' : '';

    $date_candidates = array_filter( array( $created_col, $start_col, $updated_col, $end_col ) );
    $date_sql = fus_lp_apply_date_filter_sql( 'lui', $date_from, $date_to, $date_candidates );

    $status_select = $status_col ? "lui.{$status_col} AS status," : "'' AS status,";
    $grad_select = $grad_col ? "lui.{$grad_col} AS graduation," : "'' AS graduation,";
    $start_select = $start_col ? "lui.{$start_col} AS started_at," : "NULL AS started_at,";
    $end_select = $end_col ? "lui.{$end_col} AS completed_at," : "NULL AS completed_at,";
    $created_select = $created_col ? "lui.{$created_col} AS enrolled_at" : "NULL AS enrolled_at";
    $item_type_where = $item_type_col ? " AND lui.{$item_type_col} = 'lp_course'" : '';

    $rows = $wpdb->get_results(
        "SELECT
            lui.{$item_pk} AS user_item_id,
            lui.{$course_col} AS course_id,
            lui.{$user_col} AS user_id,
            {$status_select}
            {$grad_select}
            {$start_select}
            {$end_select}
            {$created_select},
            p.post_title AS course_title
         FROM {$user_items_table} lui
         INNER JOIN {$wpdb->posts} p ON p.ID = lui.{$course_col} AND p.post_type = 'lp_course'
         WHERE lui.{$user_col} > 0 {$item_type_where} {$date_sql}
         ORDER BY p.post_title ASC"
    );

    if ( empty( $rows ) ) {
        return $summary;
    }

    $course_buckets = array();
    $all_enrolled_users = array();
    $all_started_users = array();
    $all_completed_users = array();
    $used_fallback_dates = false;

    foreach ( $rows as $r ) {
        $course_id = (int) $r->course_id;
        $user_id = (int) $r->user_id;
        if ( $course_id <= 0 || $user_id <= 0 ) continue;

        if ( ! isset( $course_buckets[ $course_id ] ) ) {
            $course_buckets[ $course_id ] = array(
                'course_id' => $course_id,
                'course_title' => isset( $r->course_title ) && $r->course_title !== '' ? wp_specialchars_decode( (string) $r->course_title, ENT_QUOTES ) : '(Untitled course)',
                'enrolled_users' => array(),
                'started_users' => array(),
                'completed_users' => array(),
                'progress_total' => 0.0,
                'progress_count' => 0,
            );
        }

        $progress = fus_lp_progress_from_record( $r );
        $course_buckets[ $course_id ]['enrolled_users'][ $user_id ] = true;
        $course_buckets[ $course_id ]['progress_total'] += $progress;
        $course_buckets[ $course_id ]['progress_count']++;
        $all_enrolled_users[ $user_id ] = true;

        $status = strtolower( trim( (string) $r->status ) );
        $graduation = strtolower( trim( (string) $r->graduation ) );
        $started_at = isset( $r->started_at ) ? (string) $r->started_at : '';
        $completed_at = isset( $r->completed_at ) ? (string) $r->completed_at : '';

        $started = ( $progress > 0 );
        if ( ! $started && $started_at && $started_at !== '0000-00-00 00:00:00' ) {
            $started = true;
            $used_fallback_dates = true;
        }

        $completed = ( $progress >= 100 )
            || in_array( $status, array( 'completed', 'finished', 'passed' ), true )
            || in_array( $graduation, array( 'completed', 'finished', 'passed' ), true );

        if ( $date_from || $date_to ) {
            if ( $started ) {
                $started_date = $started_at;
                if ( ! $started_date || $started_date === '0000-00-00 00:00:00' ) {
                    $started_date = isset( $r->enrolled_at ) ? (string) $r->enrolled_at : '';
                    $used_fallback_dates = true;
                }
                if ( ! fus_lp_date_in_range( $started_date, $date_from, $date_to ) ) {
                    $started = false;
                }
            }
            if ( $completed ) {
                $completed_date = $completed_at;
                if ( ! $completed_date || $completed_date === '0000-00-00 00:00:00' ) {
                    $completed_date = isset( $r->enrolled_at ) ? (string) $r->enrolled_at : '';
                    $used_fallback_dates = true;
                }
                if ( ! fus_lp_date_in_range( $completed_date, $date_from, $date_to ) ) {
                    $completed = false;
                }
            }
        }

        if ( $started ) {
            $course_buckets[ $course_id ]['started_users'][ $user_id ] = true;
            $all_started_users[ $user_id ] = true;
        }
        if ( $completed ) {
            $course_buckets[ $course_id ]['completed_users'][ $user_id ] = true;
            $all_completed_users[ $user_id ] = true;
        }
    }

    foreach ( $course_buckets as $bucket ) {
        $summary['rows'][] = (object) array(
            'course_id' => (int) $bucket['course_id'],
            'course_title' => (string) $bucket['course_title'],
            'enrolled_count' => count( $bucket['enrolled_users'] ),
            'started_count' => count( $bucket['started_users'] ),
            'completed_count' => count( $bucket['completed_users'] ),
            'avg_progress' => $bucket['progress_count'] > 0 ? round( $bucket['progress_total'] / $bucket['progress_count'], 1 ) : 0,
        );
    }

    usort( $summary['rows'], function( $a, $b ) {
        if ( (int) $a->enrolled_count === (int) $b->enrolled_count ) {
            return strcasecmp( (string) $a->course_title, (string) $b->course_title );
        }
        return ( (int) $a->enrolled_count > (int) $b->enrolled_count ) ? -1 : 1;
    } );

    $summary['totals'] = array(
        'courses' => count( $summary['rows'] ),
        'enrolled' => count( $all_enrolled_users ),
        'started' => count( $all_started_users ),
        'completed' => count( $all_completed_users ),
    );
    if ( $used_fallback_dates ) {
        $summary['note'] = 'Some LearnPress rows are missing start/completion timestamps. Filtering used best-available timestamps.';
    }

    return $summary;
}

function fus_get_course_learners( $course_id, $date_from = '', $date_to = '', $paged = 1, $per_page = 20 ) {
    global $wpdb;
    $result = array(
        'total' => 0,
        'rows' => array(),
        'note' => '',
        'course_title' => '',
    );
    $course_id = (int) $course_id;
    if ( $course_id <= 0 ) return $result;
    if ( ! fus_lp_is_available() ) {
        $result['note'] = 'LearnPress not detected.';
        return $result;
    }

    $user_items_table = $wpdb->prefix . 'learnpress_user_items';
    if ( ! fus_lp_table_exists( $user_items_table ) ) {
        $result['note'] = 'LearnPress data tables not found.';
        return $result;
    }

    $ui_cols = fus_lp_get_table_columns( $user_items_table );
    $item_pk = fus_lp_column_exists( $ui_cols, 'user_item_id' ) ? 'user_item_id' : ( fus_lp_column_exists( $ui_cols, 'id' ) ? 'id' : '' );
    $course_col = fus_lp_column_exists( $ui_cols, 'item_id' ) ? 'item_id' : '';
    $user_col = fus_lp_column_exists( $ui_cols, 'user_id' ) ? 'user_id' : '';
    if ( ! $item_pk || ! $course_col || ! $user_col ) {
        $result['note'] = 'LearnPress table schema is not compatible.';
        return $result;
    }

    $status_col = fus_lp_column_exists( $ui_cols, 'status' ) ? 'status' : '';
    $grad_col = fus_lp_column_exists( $ui_cols, 'graduation' ) ? 'graduation' : '';
    $start_col = fus_lp_column_exists( $ui_cols, 'start_time' ) ? 'start_time' : '';
    $end_col = fus_lp_column_exists( $ui_cols, 'end_time' ) ? 'end_time' : '';
    $created_col = fus_lp_column_exists( $ui_cols, 'created_at' ) ? 'created_at' : '';
    $updated_col = fus_lp_column_exists( $ui_cols, 'updated_at' ) ? 'updated_at' : '';
    $item_type_col = fus_lp_column_exists( $ui_cols, 'item_type' ) ? 'item_type' : '';

    $bp_activity = $wpdb->prefix . 'bp_activity';
    $bp_activity_exists = fus_lp_table_exists( $bp_activity );
    $bp_sub = $bp_activity_exists ? "(SELECT user_id, MAX(date_recorded) AS last_activity FROM {$bp_activity} WHERE type='last_activity' GROUP BY user_id)" : '';
    $date_candidates = array_filter( array( $created_col, $start_col, $updated_col, $end_col ) );
    $date_sql = fus_lp_apply_date_filter_sql( 'lui', $date_from, $date_to, $date_candidates );

    $status_select = $status_col ? "lui.{$status_col} AS status," : "'' AS status,";
    $grad_select = $grad_col ? "lui.{$grad_col} AS graduation," : "'' AS graduation,";
    $start_select = $start_col ? "lui.{$start_col} AS started_at," : "NULL AS started_at,";
    $end_select = $end_col ? "lui.{$end_col} AS completed_at," : "NULL AS completed_at,";
    $created_select = $created_col ? "lui.{$created_col} AS enrolled_at," : "NULL AS enrolled_at,";
    $updated_select = $updated_col ? "lui.{$updated_col} AS updated_at" : "NULL AS updated_at";
    $updated_order = $updated_col ? "lui.{$updated_col}" : "lui.{$item_pk}";
    $item_type_where = $item_type_col ? " AND lui.{$item_type_col} = 'lp_course'" : '';

    $base_sql = "FROM {$user_items_table} lui
        LEFT JOIN {$wpdb->users} u ON u.ID = lui.{$user_col}
        " . ( $bp_activity_exists ? "LEFT JOIN {$bp_sub} a ON a.user_id = u.ID" : '' ) . "
        WHERE lui.{$course_col} = %d
            {$item_type_where}
            AND lui.{$user_col} > 0
            {$date_sql}";

    $all_rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT DISTINCT
            lui.{$item_pk} AS user_item_id,
            lui.{$user_col} AS user_id,
            COALESCE(NULLIF(u.display_name,''), CONCAT('User #', lui.{$user_col})) AS display_name,
            COALESCE(u.user_email,'') AS user_email,
            {$status_select}
            {$grad_select}
            {$start_select}
            {$end_select}
            {$created_select}
            {$updated_select}
            " . ( $bp_activity_exists ? 'a.last_activity' : 'NULL AS last_activity' ) . "
         {$base_sql}
         ORDER BY {$updated_order} DESC",
        $course_id
    ) );

    $result['course_title'] = wp_specialchars_decode( (string) get_the_title( $course_id ), ENT_QUOTES );
    if ( ! $all_rows ) return $result;

    // Keep one row per learner (latest by updated/enrolled ordering from SQL).
    $rows_by_user = array();
    foreach ( $all_rows as $r ) {
        $uid = (int) $r->user_id;
        if ( $uid <= 0 || isset( $rows_by_user[ $uid ] ) ) continue;
        $rows_by_user[ $uid ] = $r;
    }

    $total = count( $rows_by_user );
    $offset = max( 0, ( max( 1, (int) $paged ) - 1 ) * max( 1, (int) $per_page ) );
    $rows = array_slice( array_values( $rows_by_user ), $offset, max( 1, (int) $per_page ) );
    $result['total'] = $total;
    if ( empty( $rows ) ) return $result;

    $used_fallback_dates = false;
    foreach ( $rows as $r ) {
        $progress = fus_lp_progress_from_record( $r );
        $status = strtolower( trim( (string) $r->status ) );
        $graduation = strtolower( trim( (string) $r->graduation ) );
        $started_at = isset( $r->started_at ) ? (string) $r->started_at : '';
        $completed_at = isset( $r->completed_at ) ? (string) $r->completed_at : '';
        $enrolled_at = isset( $r->enrolled_at ) ? (string) $r->enrolled_at : '';

        if ( ( ! $started_at || $started_at === '0000-00-00 00:00:00' ) && $progress > 0 ) {
            $started_at = $enrolled_at;
            $used_fallback_dates = true;
        }
        $is_completed = ( $progress >= 100 )
            || in_array( $status, array( 'completed', 'finished', 'passed' ), true )
            || in_array( $graduation, array( 'completed', 'finished', 'passed' ), true );
        if ( $is_completed && ( ! $completed_at || $completed_at === '0000-00-00 00:00:00' ) ) {
            $completed_at = $enrolled_at;
            $used_fallback_dates = true;
        }

        $mapped_status = 'enrolled';
        if ( $is_completed ) $mapped_status = 'completed';
        elseif ( $progress > 0 ) $mapped_status = 'started';

        $result['rows'][] = (object) array(
            'user_id' => (int) $r->user_id,
            'display_name' => (string) $r->display_name,
            'user_email' => (string) $r->user_email,
            'status' => $mapped_status,
            'progress' => round( (float) $progress, 1 ),
            'started_at' => $started_at,
            'completed_at' => $completed_at,
            'last_activity' => isset( $r->last_activity ) ? (string) $r->last_activity : '',
        );
    }

    if ( $used_fallback_dates ) {
        $result['note'] = 'Some rows are missing LearnPress start/completion timestamps; fallback timestamps were used.';
    }

    return $result;
}

// ─────────────────────────────────────────────────────────────────
// 5. SEGMENT WHERE CLAUSES
// ─────────────────────────────────────────────────────────────────
function fus_segment_where( $segment, $date_from, $date_to ) {
    global $wpdb;
    $w = array();

    if ( in_array( $segment, array( 'testing', 'internal', 'uploaded', 'registered', 'approved', 'pending' ), true ) ) {
        $w[] = fus_is_segment_effective_where_sql( $segment, 'u' );
    }

    if ( $segment !== 'uploaded' ) {
        if ( $date_from ) $w[] = $wpdb->prepare("u.user_registered >= %s", $date_from . ' 00:00:00');
        if ( $date_to )   $w[] = $wpdb->prepare("u.user_registered <= %s", $date_to   . ' 23:59:59');
    }
    return $w;
}

function fus_sanitize_zoho_filter( $value ) {
    $value = sanitize_key( (string) $value );
    $allowed = array( 'all', 'client', 'lead', 'not_found', 'error', 'pending' );
    return in_array( $value, $allowed, true ) ? $value : 'all';
}

function fus_get_zoho_filter_where( $zoho_filter, $alias = 'zstat' ) {
    $zoho_filter = fus_sanitize_zoho_filter( $zoho_filter );
    if ( $zoho_filter === 'all' ) return '';
    if ( in_array( $zoho_filter, array( 'client', 'lead', 'not_found', 'error' ), true ) ) {
        return " AND {$alias}.zoho_status = '" . esc_sql( $zoho_filter ) . "'";
    }
    return " AND ( {$alias}.zoho_status IS NULL OR {$alias}.zoho_status = '' OR {$alias}.zoho_status NOT IN ('client','lead','not_found','error') )";
}

// ─────────────────────────────────────────────────────────────────
// 6. FETCH USER LIST
// ─────────────────────────────────────────────────────────────────
function fus_get_users( $segment, $date_from, $date_to, $search, $orderby, $order, $page, $per_page, $zoho_filter = 'all' ) {
    global $wpdb;
    fus_maybe_import_wsal_login_history();

    $allowed_orderby = array('display_name','user_email','user_registered','last_activity','login_count','mobile','indstate','drn');
    $allowed_order   = array('ASC','DESC');
    if ( ! in_array($orderby, $allowed_orderby) ) $orderby = 'user_registered';
    if ( ! in_array(strtoupper($order), $allowed_order) ) $order = 'DESC';

    $bp_activity = $wpdb->prefix . 'bp_activity';
    $bp_sub = "(SELECT user_id, MAX(date_recorded) AS last_activity FROM {$bp_activity} WHERE type='last_activity' GROUP BY user_id)";
    $zoho_sub = "(SELECT user_id, MAX(meta_value) AS zoho_status FROM {$wpdb->usermeta} WHERE meta_key = '" . FUS_ZOHO_STATUS_META . "' GROUP BY user_id)";
    $login_events_sub = fus_get_wsal_login_events_subquery();
    $lc_expr = "CAST(COALESCE(NULLIF(lc.meta_value,''),'0') AS UNSIGNED)";
    $lc_join = "LEFT JOIN {$wpdb->usermeta} lc  ON lc.user_id  = u.ID AND lc.meta_key  = '" . FUS_LOGIN_COUNT_META . "'";
    if ( $login_events_sub !== '' ) {
        $lc_expr = "CAST(COALESCE(lc_wsal.total_logins, CAST(COALESCE(NULLIF(lc.meta_value,''),'0') AS UNSIGNED), 0) AS UNSIGNED)";
        $lc_join = "LEFT JOIN (
                SELECT ev.user_id, COUNT(*) AS total_logins
                FROM ({$login_events_sub}) ev
                WHERE ev.user_id > 0
                GROUP BY ev.user_id
            ) lc_wsal ON lc_wsal.user_id = u.ID
            LEFT JOIN {$wpdb->usermeta} lc ON lc.user_id = u.ID AND lc.meta_key = '" . FUS_LOGIN_COUNT_META . "'";
    }

    $select = "SELECT DISTINCT u.ID, u.display_name, u.user_email, u.user_registered,
                    a.last_activity,
                    {$lc_expr} AS login_count,
                    COALESCE(mob.meta_value,'') AS mobile,
                    COALESCE(ist.meta_value,'') AS indstate,
                    COALESCE(drn.meta_value,'') AS drn,
                    CASE WHEN ver.user_id IS NOT NULL THEN 'approved' ELSE 'pending' END AS approval_status";

    $from = "FROM {$wpdb->users} u
             LEFT JOIN {$bp_sub} a      ON a.user_id  = u.ID
             {$lc_join}
             LEFT JOIN {$wpdb->usermeta} mob ON mob.user_id = u.ID AND mob.meta_key = '" . FUS_MOBILE_META . "'
             LEFT JOIN {$wpdb->usermeta} ist ON ist.user_id = u.ID AND ist.meta_key = '" . FUS_STATE_META . "'
             LEFT JOIN {$wpdb->usermeta} drn ON drn.user_id = u.ID AND drn.meta_key = '" . FUS_DRN_META . "'
             LEFT JOIN {$wpdb->usermeta} ver ON ver.user_id = u.ID AND ver.meta_key = '" . FUS_VERIFIED_META_KEY . "' AND ver.meta_value = '" . FUS_VERIFIED_META_VALUE . "'
             LEFT JOIN {$zoho_sub} zstat ON zstat.user_id = u.ID";

    $wheres = fus_segment_where($segment, $date_from, $date_to);
    if ( $search ) {
        $like = '%' . $wpdb->esc_like($search) . '%';
        $wheres[] = $wpdb->prepare(
            "(u.display_name LIKE %s OR u.user_email LIKE %s OR u.user_login LIKE %s OR mob.meta_value LIKE %s)",
            $like, $like, $like, $like
        );
    }
    $where_sql = $wheres ? 'WHERE ' . implode(' AND ', $wheres) : 'WHERE 1=1';
    $where_sql .= fus_get_zoho_filter_where( $zoho_filter, 'zstat' );

    $col_map = array(
        'last_activity'=>'a.last_activity','login_count'=>$lc_expr,
        'mobile'=>'mob.meta_value','indstate'=>'ist.meta_value','drn'=>'drn.meta_value',
        'display_name'=>'u.display_name','user_email'=>'u.user_email','user_registered'=>'u.user_registered',
    );
    $order_col = isset($col_map[$orderby]) ? $col_map[$orderby] : 'u.user_registered';
    $order_sql = "ORDER BY {$order_col} {$order}";
    $offset    = ($page - 1) * $per_page;
    $limit_sql = $wpdb->prepare("LIMIT %d OFFSET %d", $per_page, $offset);

    $total = (int) $wpdb->get_var("SELECT COUNT(DISTINCT u.ID) {$from} {$where_sql}");
    $rows  = $wpdb->get_results("{$select} {$from} {$where_sql} {$order_sql} {$limit_sql}");

    return array('total'=>$total,'rows'=>$rows);
}

function fus_get_filtered_user_ids( $segment, $date_from, $date_to, $search, $zoho_filter = 'all' ) {
    global $wpdb;
    $zoho_sub = "(SELECT user_id, MAX(meta_value) AS zoho_status FROM {$wpdb->usermeta} WHERE meta_key = '" . FUS_ZOHO_STATUS_META . "' GROUP BY user_id)";
    $from = "FROM {$wpdb->users} u
             LEFT JOIN {$wpdb->usermeta} mob ON mob.user_id = u.ID AND mob.meta_key = '" . FUS_MOBILE_META . "'
             LEFT JOIN {$zoho_sub} zstat ON zstat.user_id = u.ID";

    $wheres = fus_segment_where( $segment, $date_from, $date_to );
    if ( $search ) {
        $like = '%' . $wpdb->esc_like( $search ) . '%';
        $wheres[] = $wpdb->prepare(
            "(u.display_name LIKE %s OR u.user_email LIKE %s OR u.user_login LIKE %s OR mob.meta_value LIKE %s)",
            $like, $like, $like, $like
        );
    }
    $where_sql = $wheres ? 'WHERE ' . implode( ' AND ', $wheres ) : 'WHERE 1=1';
    $where_sql .= fus_get_zoho_filter_where( $zoho_filter, 'zstat' );

    $ids = $wpdb->get_col(
        "SELECT DISTINCT u.ID
         {$from}
         {$where_sql}
         ORDER BY u.ID ASC"
    );
    if ( ! is_array( $ids ) ) return array();
    return array_values( array_map( 'intval', $ids ) );
}

function fus_get_zoho_bifurcation_counts( $segment, $date_from, $date_to, $search ) {
    global $wpdb;
    $zoho_sub = "(SELECT user_id, MAX(meta_value) AS zoho_status FROM {$wpdb->usermeta} WHERE meta_key = '" . FUS_ZOHO_STATUS_META . "' GROUP BY user_id)";

    $from = "FROM {$wpdb->users} u
             LEFT JOIN {$wpdb->usermeta} mob ON mob.user_id = u.ID AND mob.meta_key = '" . FUS_MOBILE_META . "'
             LEFT JOIN {$zoho_sub} zstat ON zstat.user_id = u.ID";

    $wheres = fus_segment_where( $segment, $date_from, $date_to );
    if ( $search ) {
        $like = '%' . $wpdb->esc_like( $search ) . '%';
        $wheres[] = $wpdb->prepare(
            "(u.display_name LIKE %s OR u.user_email LIKE %s OR u.user_login LIKE %s OR mob.meta_value LIKE %s)",
            $like, $like, $like, $like
        );
    }
    $where_sql = $wheres ? 'WHERE ' . implode( ' AND ', $wheres ) : 'WHERE 1=1';

    $counts = array(
        'total' => 0,
        'client' => 0,
        'lead' => 0,
        'not_found' => 0,
        'error' => 0,
        'pending' => 0,
    );

    $counts['total'] = (int) $wpdb->get_var(
        "SELECT COUNT(DISTINCT u.ID)
         {$from}
         {$where_sql}"
    );

    $rows = $wpdb->get_results(
        "SELECT
            CASE
                WHEN zstat.zoho_status IN ('client','lead','not_found','error') THEN zstat.zoho_status
                ELSE 'pending'
            END AS zoho_type,
            COUNT(DISTINCT u.ID) AS cnt
         {$from}
         {$where_sql}
         GROUP BY zoho_type"
    );

    if ( $rows ) {
        foreach ( $rows as $r ) {
            $key = isset( $r->zoho_type ) ? sanitize_key( (string) $r->zoho_type ) : 'pending';
            if ( isset( $counts[ $key ] ) ) {
                $counts[ $key ] = (int) $r->cnt;
            }
        }
    }

    // Fallback safety: keep pill "All" in sync with table total even if grouped query fails.
    if ( $counts['total'] <= 0 ) {
        $fallback = fus_get_users( $segment, $date_from, $date_to, $search, 'user_registered', 'DESC', 1, 1, 'all' );
        $counts['total'] = isset( $fallback['total'] ) ? (int) $fallback['total'] : 0;
    }

    return $counts;
}

// ─────────────────────────────────────────────────────────────────
// 7. CSV EXPORT
// ─────────────────────────────────────────────────────────────────
add_action('admin_init', function() {
    if ( (isset($_GET['page']) ? $_GET['page'] : '') !== 'finnovate-user-stats' ) return;
    $is_user_export = ((isset($_GET['fus_export']) ? $_GET['fus_export'] : '') === '1');
    $is_leaderboard_export = ((isset($_GET['fus_export_leaderboard']) ? $_GET['fus_export_leaderboard'] : '') === '1');
    if ( ! $is_user_export && ! $is_leaderboard_export ) return;
    if ( ! current_user_can('manage_options') ) wp_die('Unauthorized');

    if ( $is_leaderboard_export ) {
        $lb_period    = sanitize_key(isset($_GET['lb_period']) ? $_GET['lb_period'] : 'all');
        $lb_date_from = sanitize_text_field(isset($_GET['lb_date_from']) ? $_GET['lb_date_from'] : '');
        $lb_date_to   = sanitize_text_field(isset($_GET['lb_date_to']) ? $_GET['lb_date_to'] : '');
        $include_internal = ! ( isset($_GET['include_internal']) && sanitize_text_field($_GET['include_internal']) === '0' );

        if ( $lb_period && $lb_period !== 'custom' && $lb_period !== 'all' ) {
            $lb_date_to = date('Y-m-d');
            if      ($lb_period === 'today')      { $lb_date_from = date('Y-m-d'); }
            elseif  ($lb_period === 'yesterday')  { $lb_date_from = date('Y-m-d', strtotime('-1 day')); $lb_date_to = $lb_date_from; }
            elseif  ($lb_period === 'last7')      { $lb_date_from = date('Y-m-d', strtotime('-6 days')); }
            elseif  ($lb_period === 'last30')     { $lb_date_from = date('Y-m-d', strtotime('-29 days')); }
            elseif  ($lb_period === 'thismonth')  { $lb_date_from = date('Y-m-01'); }
            elseif  ($lb_period === 'lastmonth')  {
                $lb_date_from = date('Y-m-01', strtotime('first day of last month'));
                $lb_date_to   = date('Y-m-t',  strtotime('last day of last month'));
            }
        } elseif ( $lb_period === 'all' ) {
            $lb_date_from = '';
            $lb_date_to   = '';
        }

        $result = fus_get_leaderboard_users($lb_date_from, $lb_date_to, 1, 99999, $include_internal);

        header('Content-Type: text/csv; charset=UTF-8');
        header('Content-Disposition: attachment; filename="leaderboard-' . date('Y-m-d') . '.csv"');
        header('Pragma: no-cache');

        $out = fopen('php://output','w');
        fputcsv($out, array('Rank','User ID','Display Name','Email','Views','Total Time (sec)','Total Time (hh:mm:ss)','Avg Time/View (sec)','Last Seen'));
        $rank = 1;
        foreach ($result['rows'] as $r) {
            fputcsv($out, array(
                $rank++,
                (int)$r->user_id,
                $r->display_name,
                $r->user_email,
                (int)$r->total_views,
                (int)$r->total_time_spent,
                fus_format_seconds((int)$r->total_time_spent),
                is_null($r->avg_time_spent) ? '' : round((float)$r->avg_time_spent, 2),
                $r->last_viewed_at ? $r->last_viewed_at : '',
            ));
        }
        fclose($out);
        exit;
    }

    $segment   = sanitize_key(isset($_GET['segment'])   ? $_GET['segment']   : 'registered');
    $date_from = sanitize_text_field(isset($_GET['date_from']) ? $_GET['date_from'] : '');
    $date_to   = sanitize_text_field(isset($_GET['date_to'])   ? $_GET['date_to']   : '');
    $search    = sanitize_text_field(isset($_GET['search'])    ? $_GET['search']    : '');
    $orderby   = sanitize_key(isset($_GET['orderby'])   ? $_GET['orderby']   : 'user_registered');
    $order     = sanitize_key(isset($_GET['order'])     ? $_GET['order']     : 'DESC');
    $zoho_filter = fus_sanitize_zoho_filter( isset($_GET['zoho_filter']) ? $_GET['zoho_filter'] : 'all' );

    $result = fus_get_users($segment, $date_from, $date_to, $search, $orderby, $order, 1, 99999, $zoho_filter);

    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="users-' . $segment . '-' . date('Y-m-d') . '.csv"');
    header('Pragma: no-cache');

    $out = fopen('php://output','w');
    fputcsv($out, array('ID','Display Name','Email','Registered Date','Last Active','Login Count','Mobile','State','DRN'));
    foreach ($result['rows'] as $r) {
        fputcsv($out, array(
            $r->ID, $r->display_name, $r->user_email,
            ($r->user_registered === '0000-00-00 00:00:00') ? 'Uploaded' : $r->user_registered,
            isset($r->last_activity) ? $r->last_activity : '',
            (int)$r->login_count, $r->mobile, $r->indstate, $r->drn,
        ));
    }
    fclose($out);
    exit;
});

// ─────────────────────────────────────────────────────────────────
// 8. URL HELPERS
// ─────────────────────────────────────────────────────────────────
function fus_build_url($overrides = array()) {
    $keep = array();
    foreach (array('segment','period','date_from','date_to','search','orderby','order','paged','tab','gperiod','gdate_from','gdate_to','lb_period','lb_date_from','lb_date_to','lb_paged','lb_orderby','lb_order','course_period','course_date_from','course_date_to','course_id','course_paged','activity_period','activity_date_from','activity_date_to','include_internal','zoho_filter','zoho_module','zoho_tab_search','zoho_tab_paged','zoho_tab_per_page','zoho_sync_segment') as $k) {
        if (isset($_GET[$k]) && $_GET[$k] !== '') $keep[$k] = sanitize_text_field($_GET[$k]);
    }
    return admin_url('admin.php?' . http_build_query(array_merge(array('page'=>'finnovate-user-stats'), $keep, $overrides)));
}

function fus_sort_url($col) {
    $cur = (isset($_GET['orderby']) && $_GET['orderby'] === $col && isset($_GET['order']) && $_GET['order'] === 'ASC') ? 'DESC' : 'ASC';
    return fus_build_url(array('orderby'=>$col,'order'=>$cur,'paged'=>1));
}

function fus_sort_arrow($col) {
    if (!isset($_GET['orderby']) || $_GET['orderby'] !== $col) return '<span class="sort-arrow">&#8597;</span>';
    return '<span class="sort-arrow">' . ((isset($_GET['order']) && $_GET['order'] === 'ASC') ? '&#8593;' : '&#8595;') . '</span>';
}

function fus_get_login_trend_meta_dataset( $range, $exclude_internal_join = '' ) {
    global $wpdb;

    $unique_ever = (int) $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(DISTINCT um.user_id)
         FROM {$wpdb->usermeta} um
         INNER JOIN {$wpdb->users} u ON u.ID = um.user_id
         WHERE um.meta_key = %s AND CAST(um.meta_value AS UNSIGNED) > 0 {$exclude_internal_join}",
        FUS_LOGIN_COUNT_META
    ));

    $total_logins = (int) $wpdb->get_var($wpdb->prepare(
        "SELECT SUM(CAST(um.meta_value AS UNSIGNED))
         FROM {$wpdb->usermeta} um
         INNER JOIN {$wpdb->users} u ON u.ID = um.user_id
         WHERE um.meta_key = %s {$exclude_internal_join}",
        FUS_LOGIN_COUNT_META
    ));

    if ($range === 'monthly') {
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT LEFT(REPLACE(meta_key, %s, ''), 7) AS period, SUM(CAST(meta_value AS UNSIGNED)) AS cnt
             FROM {$wpdb->usermeta} um
             INNER JOIN {$wpdb->users} u ON u.ID = um.user_id
             WHERE meta_key LIKE %s {$exclude_internal_join}
             GROUP BY period ORDER BY period ASC",
            'fus_login_log_',
            'fus_login_log_%'
        ));
        $labels = array(); $data = array(); $keys = array();
        foreach ($rows as $r) {
            $keys[]   = (string) $r->period;
            $labels[] = date('M Y', strtotime($r->period . '-01'));
            $data[]   = (int)$r->cnt;
        }
    } else {
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT REPLACE(meta_key, %s, '') AS dt, SUM(CAST(meta_value AS UNSIGNED)) AS cnt
             FROM {$wpdb->usermeta} um
             INNER JOIN {$wpdb->users} u ON u.ID = um.user_id
             WHERE meta_key LIKE %s AND REPLACE(meta_key, %s, '') >= %s {$exclude_internal_join}
             GROUP BY dt ORDER BY dt ASC",
            'fus_login_log_',
            'fus_login_log_%',
            'fus_login_log_',
            date('Y-m-d', strtotime('-60 days'))
        ));
        $labels = array(); $data = array(); $keys = array();
        foreach ($rows as $r) {
            $keys[]   = (string) $r->dt;
            $labels[] = date('d M', strtotime($r->dt));
            $data[]   = (int)$r->cnt;
        }
    }

    return array(
        'unique_ever' => $unique_ever,
        'total_logins' => $total_logins,
        'labels' => $labels,
        'keys' => $keys,
        'data' => $data,
    );
}

// ─────────────────────────────────────────────────────────────────
// 9. AJAX: MoM Growth Chart
// ─────────────────────────────────────────────────────────────────
add_action('wp_ajax_fus_get_mom_growth', function() {
    if (!current_user_can('manage_options')) wp_send_json_error();
    global $wpdb;
    $registered_where = fus_is_segment_effective_where_sql( 'registered', 'u' );
    $results = $wpdb->get_results(
        "SELECT DATE_FORMAT(u.user_registered,'%Y-%m') AS month, COUNT(u.ID) AS count
         FROM {$wpdb->users} u
         WHERE u.user_registered != '0000-00-00 00:00:00' AND {$registered_where}
         GROUP BY month ORDER BY month ASC"
    );
    $labels = array(); $data = array(); $cumulative = 0;
    foreach ($results as $r) {
        $labels[]    = date('M Y', strtotime($r->month . '-01'));
        $data[]      = (int)$r->count;
        $cumulative += (int)$r->count;
    }
    wp_send_json_success(array('labels'=>$labels,'data'=>$data,'total'=>$cumulative));
});

// ─────────────────────────────────────────────────────────────────
// 10. AJAX: Login Trend Data
// ─────────────────────────────────────────────────────────────────
add_action('wp_ajax_fus_get_login_trend', function() {
    if (!current_user_can('manage_options')) wp_send_json_error();
    global $wpdb;
    fus_maybe_import_wsal_login_history();

    $range = sanitize_key(isset($_GET['range']) ? $_GET['range'] : 'daily');
    $include_internal = ! ( isset($_GET['include_internal']) && sanitize_text_field($_GET['include_internal']) === '0' );
    $internal_where = fus_is_segment_effective_where_sql( 'internal', 'u' );
    $exclude_internal_join = $include_internal ? '' : " AND NOT ( {$internal_where} )";
    $login_events_sub = fus_get_wsal_login_events_subquery();

    if ( $login_events_sub !== '' ) {
        $unique_ever = (int) $wpdb->get_var(
            "SELECT COUNT(DISTINCT ev.user_id)
             FROM ({$login_events_sub}) ev
             INNER JOIN {$wpdb->users} u ON u.ID = ev.user_id
             WHERE ev.user_id > 0 {$exclude_internal_join}"
        );

        $total_logins = (int) $wpdb->get_var(
            "SELECT COUNT(*)
             FROM ({$login_events_sub}) ev
             INNER JOIN {$wpdb->users} u ON u.ID = ev.user_id
             WHERE ev.user_id > 0 {$exclude_internal_join}"
        );

        if ( $range === 'monthly' ) {
            $rows = $wpdb->get_results(
                "SELECT DATE_FORMAT(ev.event_at, '%Y-%m') AS period, COUNT(*) AS cnt
                 FROM ({$login_events_sub}) ev
                 INNER JOIN {$wpdb->users} u ON u.ID = ev.user_id
                 WHERE ev.user_id > 0 {$exclude_internal_join}
                 GROUP BY period
                 ORDER BY period ASC"
            );
            $labels = array(); $data = array(); $keys = array();
            foreach ( $rows as $r ) {
                $keys[]   = (string) $r->period;
                $labels[] = date( 'M Y', strtotime( $r->period . '-01' ) );
                $data[]   = (int) $r->cnt;
            }
        } else {
            $from_date = date( 'Y-m-d', strtotime( '-60 days' ) );
            $rows = $wpdb->get_results( $wpdb->prepare(
                "SELECT DATE(ev.event_at) AS dt, COUNT(*) AS cnt
                 FROM ({$login_events_sub}) ev
                 INNER JOIN {$wpdb->users} u ON u.ID = ev.user_id
                 WHERE ev.user_id > 0
                   AND DATE(ev.event_at) >= %s
                   {$exclude_internal_join}
                 GROUP BY dt
                 ORDER BY dt ASC",
                $from_date
            ) );
            $labels = array(); $data = array(); $keys = array();
            foreach ( $rows as $r ) {
                $keys[]   = (string) $r->dt;
                $labels[] = date( 'd M', strtotime( $r->dt ) );
                $data[]   = (int) $r->cnt;
            }
        }
        // If WSAL has no usable rows for this filter, fall back to plugin login meta so chart does not go blank.
        if ( $total_logins <= 0 && empty( $data ) ) {
            $meta = fus_get_login_trend_meta_dataset( $range, $exclude_internal_join );
            $unique_ever = (int) $meta['unique_ever'];
            $total_logins = (int) $meta['total_logins'];
            $labels = (array) $meta['labels'];
            $keys = (array) $meta['keys'];
            $data = (array) $meta['data'];
        }
    } else {
        $meta = fus_get_login_trend_meta_dataset( $range, $exclude_internal_join );
        $unique_ever = (int) $meta['unique_ever'];
        $total_logins = (int) $meta['total_logins'];
        $labels = (array) $meta['labels'];
        $keys = (array) $meta['keys'];
        $data = (array) $meta['data'];
    }

    wp_send_json_success(array(
        'labels'       => $labels,
        'keys'         => $keys,
        'data'         => $data,
        'unique_ever'  => $unique_ever,
        'total_logins' => $total_logins,
    ));
});

function fus_get_login_trend_users_data( $range, $period_key, $paged = 1, $per_page = 20, $orderby = 'period_logins', $order = 'DESC', $include_internal = true ) {
    global $wpdb;

    $range = ( $range === 'monthly' ) ? 'monthly' : 'daily';
    $paged = max( 1, (int) $paged );
    $per_page = max( 1, min( 100, (int) $per_page ) );
    $order = ( strtoupper( $order ) === 'ASC' ) ? 'ASC' : 'DESC';
    $allowed_orderby = array( 'display_name', 'user_email', 'user_registered', 'last_activity', 'period_logins', 'total_logins', 'mobile', 'indstate', 'drn' );
    if ( ! in_array( $orderby, $allowed_orderby, true ) ) $orderby = 'period_logins';
    $login_events_sub = fus_get_wsal_login_events_subquery();

    if ( $login_events_sub !== '' ) {
        $period_subquery = '';
        $period_label = '';
        if ( $range === 'monthly' ) {
            if ( ! preg_match( '/^\d{4}-\d{2}$/', $period_key ) ) {
                return array( 'total' => 0, 'rows' => array(), 'period_label' => '' );
            }
            $period_subquery = $wpdb->prepare(
                "(SELECT ev.user_id, COUNT(*) AS period_logins
                  FROM ({$login_events_sub}) ev
                  WHERE DATE_FORMAT(ev.event_at, '%%Y-%%m') = %s
                  GROUP BY ev.user_id)",
                $period_key
            );
            $period_label = date( 'M Y', strtotime( $period_key . '-01' ) );
        } else {
            if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $period_key ) ) {
                return array( 'total' => 0, 'rows' => array(), 'period_label' => '' );
            }
            $period_subquery = $wpdb->prepare(
                "(SELECT ev.user_id, COUNT(*) AS period_logins
                  FROM ({$login_events_sub}) ev
                  WHERE DATE(ev.event_at) = %s
                  GROUP BY ev.user_id)",
                $period_key
            );
            $period_label = date( 'd M Y', strtotime( $period_key ) );
        }

        $bp_activity = $wpdb->prefix . 'bp_activity';
        $bp_sub = "(SELECT user_id, MAX(date_recorded) AS last_activity FROM {$bp_activity} WHERE type='last_activity' GROUP BY user_id)";
        $total_subquery = "(SELECT ev.user_id, COUNT(*) AS total_logins FROM ({$login_events_sub}) ev WHERE ev.user_id > 0 GROUP BY ev.user_id)";
        $total_logins_expr = "CAST(COALESCE(lt.total_logins,0) AS UNSIGNED)";
        $period_logins_expr = "CAST(COALESCE(pl.period_logins,0) AS UNSIGNED)";
        $offset = ($paged - 1) * $per_page;

        $col_map = array(
            'display_name'   => 'u.display_name',
            'user_email'     => 'u.user_email',
            'user_registered'=> 'u.user_registered',
            'last_activity'  => 'a.last_activity',
            'period_logins'  => $period_logins_expr,
            'total_logins'   => $total_logins_expr,
            'mobile'         => 'mob.meta_value',
            'indstate'       => 'ist.meta_value',
            'drn'            => 'drn.meta_value',
        );
        $order_col = isset( $col_map[ $orderby ] ) ? $col_map[ $orderby ] : $period_logins_expr;

        $from_sql = "FROM {$wpdb->users} u
            INNER JOIN {$period_subquery} pl ON pl.user_id = u.ID
            LEFT JOIN {$total_subquery} lt ON lt.user_id = u.ID
            LEFT JOIN {$bp_sub} a ON a.user_id = u.ID
            LEFT JOIN {$wpdb->usermeta} mob ON mob.user_id = u.ID AND mob.meta_key = '" . FUS_MOBILE_META . "'
            LEFT JOIN {$wpdb->usermeta} ist ON ist.user_id = u.ID AND ist.meta_key = '" . FUS_STATE_META . "'
            LEFT JOIN {$wpdb->usermeta} drn ON drn.user_id = u.ID AND drn.meta_key = '" . FUS_DRN_META . "'
            WHERE {$period_logins_expr} > 0";
        if ( ! $include_internal ) {
            $internal_where = fus_is_segment_effective_where_sql( 'internal', 'u' );
            $from_sql .= " AND NOT ( {$internal_where} )";
        }

        $total = (int) $wpdb->get_var( "SELECT COUNT(DISTINCT u.ID) {$from_sql}" );
        $rows = $wpdb->get_results(
            "SELECT DISTINCT
                u.ID, u.display_name, u.user_email, u.user_registered, a.last_activity,
                {$period_logins_expr} AS period_logins,
                {$total_logins_expr} AS total_logins,
                COALESCE(mob.meta_value,'') AS mobile,
                COALESCE(ist.meta_value,'') AS indstate,
                COALESCE(drn.meta_value,'') AS drn
             {$from_sql}
             ORDER BY {$order_col} {$order}
             " . $wpdb->prepare( 'LIMIT %d OFFSET %d', $per_page, $offset )
        );

        if ( $total > 0 ) {
            return array(
                'total' => $total,
                'rows'  => $rows,
                'period_label' => $period_label,
            );
        }
    }

    $period_subquery = '';
    $period_label = '';
    if ( $range === 'monthly' ) {
        if ( ! preg_match( '/^\d{4}-\d{2}$/', $period_key ) ) {
            return array( 'total' => 0, 'rows' => array(), 'period_label' => '' );
        }
        $period_subquery = $wpdb->prepare(
            "(SELECT user_id, SUM(CAST(meta_value AS UNSIGNED)) AS period_logins
              FROM {$wpdb->usermeta}
              WHERE meta_key LIKE %s
              GROUP BY user_id)",
            'fus_login_log_' . $period_key . '-%'
        );
        $period_label = date( 'M Y', strtotime( $period_key . '-01' ) );
    } else {
        if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $period_key ) ) {
            return array( 'total' => 0, 'rows' => array(), 'period_label' => '' );
        }
        $period_subquery = $wpdb->prepare(
            "(SELECT user_id, SUM(CAST(meta_value AS UNSIGNED)) AS period_logins
              FROM {$wpdb->usermeta}
              WHERE meta_key = %s
              GROUP BY user_id)",
            'fus_login_log_' . $period_key
        );
        $period_label = date( 'd M Y', strtotime( $period_key ) );
    }

    $bp_activity = $wpdb->prefix . 'bp_activity';
    $bp_sub = "(SELECT user_id, MAX(date_recorded) AS last_activity FROM {$bp_activity} WHERE type='last_activity' GROUP BY user_id)";
    $total_logins_expr = "CAST(COALESCE(NULLIF(lc.meta_value,''),'0') AS UNSIGNED)";
    $period_logins_expr = "CAST(COALESCE(pl.period_logins,0) AS UNSIGNED)";
    $offset = ($paged - 1) * $per_page;

    $col_map = array(
        'display_name'   => 'u.display_name',
        'user_email'     => 'u.user_email',
        'user_registered'=> 'u.user_registered',
        'last_activity'  => 'a.last_activity',
        'period_logins'  => $period_logins_expr,
        'total_logins'   => $total_logins_expr,
        'mobile'         => 'mob.meta_value',
        'indstate'       => 'ist.meta_value',
        'drn'            => 'drn.meta_value',
    );
    $order_col = isset( $col_map[ $orderby ] ) ? $col_map[ $orderby ] : $period_logins_expr;

    $from_sql = "FROM {$wpdb->users} u
        INNER JOIN {$period_subquery} pl ON pl.user_id = u.ID
        LEFT JOIN {$bp_sub} a ON a.user_id = u.ID
        LEFT JOIN {$wpdb->usermeta} lc  ON lc.user_id  = u.ID AND lc.meta_key  = '" . FUS_LOGIN_COUNT_META . "'
        LEFT JOIN {$wpdb->usermeta} mob ON mob.user_id = u.ID AND mob.meta_key = '" . FUS_MOBILE_META . "'
        LEFT JOIN {$wpdb->usermeta} ist ON ist.user_id = u.ID AND ist.meta_key = '" . FUS_STATE_META . "'
        LEFT JOIN {$wpdb->usermeta} drn ON drn.user_id = u.ID AND drn.meta_key = '" . FUS_DRN_META . "'
        WHERE {$period_logins_expr} > 0";
    if ( ! $include_internal ) {
        $internal_where = fus_is_segment_effective_where_sql( 'internal', 'u' );
        $from_sql .= " AND NOT ( {$internal_where} )";
    }

    $total = (int) $wpdb->get_var( "SELECT COUNT(DISTINCT u.ID) {$from_sql}" );
    $rows = $wpdb->get_results(
        "SELECT DISTINCT
            u.ID, u.display_name, u.user_email, u.user_registered, a.last_activity,
            {$period_logins_expr} AS period_logins,
            {$total_logins_expr} AS total_logins,
            COALESCE(mob.meta_value,'') AS mobile,
            COALESCE(ist.meta_value,'') AS indstate,
            COALESCE(drn.meta_value,'') AS drn
         {$from_sql}
         ORDER BY {$order_col} {$order}
         " . $wpdb->prepare( 'LIMIT %d OFFSET %d', $per_page, $offset )
    );

    return array(
        'total' => $total,
        'rows'  => $rows,
        'period_label' => $period_label,
    );
}

add_action( 'wp_ajax_fus_get_login_trend_users', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( array( 'message' => 'Unauthorized' ), 403 );
    check_ajax_referer( 'fus_login_trend_users', 'nonce' );
    fus_maybe_import_wsal_login_history();

    $range = sanitize_key( isset( $_GET['range'] ) ? $_GET['range'] : 'daily' );
    $period_key = sanitize_text_field( isset( $_GET['period_key'] ) ? $_GET['period_key'] : '' );
    $paged = max( 1, (int) ( isset( $_GET['paged'] ) ? $_GET['paged'] : 1 ) );
    $per_page = max( 1, min( 100, (int) ( isset( $_GET['per_page'] ) ? $_GET['per_page'] : 20 ) ) );
    $orderby = sanitize_key( isset( $_GET['orderby'] ) ? $_GET['orderby'] : 'period_logins' );
    $order = sanitize_key( isset( $_GET['order'] ) ? $_GET['order'] : 'DESC' );
    $include_internal = ! ( isset($_GET['include_internal']) && sanitize_text_field($_GET['include_internal']) === '0' );

    $data = fus_get_login_trend_users_data( $range, $period_key, $paged, $per_page, $orderby, $order, $include_internal );
    $total_pages = max( 1, (int) ceil( ((int) $data['total']) / $per_page ) );

    wp_send_json_success( array(
        'rows' => $data['rows'],
        'total' => (int) $data['total'],
        'paged' => $paged,
        'per_page' => $per_page,
        'total_pages' => $total_pages,
        'orderby' => $orderby,
        'order' => strtoupper( $order ) === 'ASC' ? 'ASC' : 'DESC',
        'period_label' => $data['period_label'],
    ) );
} );

add_action( 'wp_ajax_fus_get_course_learners', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( array( 'message' => 'Unauthorized' ), 403 );
    check_ajax_referer( 'fus_course_learners', 'nonce' );

    $course_id = absint( isset( $_GET['course_id'] ) ? $_GET['course_id'] : 0 );
    $date_from = sanitize_text_field( isset( $_GET['date_from'] ) ? $_GET['date_from'] : '' );
    $date_to   = sanitize_text_field( isset( $_GET['date_to'] ) ? $_GET['date_to'] : '' );
    $paged     = max( 1, (int) ( isset( $_GET['paged'] ) ? $_GET['paged'] : 1 ) );
    $per_page  = max( 1, min( 100, (int) ( isset( $_GET['per_page'] ) ? $_GET['per_page'] : 20 ) ) );

    if ( ! $course_id ) wp_send_json_error( array( 'message' => 'Invalid course ID.' ), 400 );

    $data = fus_get_course_learners( $course_id, $date_from, $date_to, $paged, $per_page );
    $total_pages = max( 1, (int) ceil( ((int) $data['total']) / $per_page ) );

    wp_send_json_success( array(
        'course_id'    => $course_id,
        'course_title' => (string) $data['course_title'],
        'rows'         => $data['rows'],
        'total'        => (int) $data['total'],
        'paged'        => $paged,
        'per_page'     => $per_page,
        'total_pages'  => $total_pages,
        'note'         => isset( $data['note'] ) ? (string) $data['note'] : '',
    ) );
} );

function fus_get_segment_transition_targets( $source_segment ) {
    $map = array(
        'pending'    => array( 'testing', 'internal' ),
        'testing'    => array( 'registered', 'internal', 'pending' ),
        'internal'   => array( 'registered', 'testing', 'pending' ),
        'registered' => array( 'testing', 'internal', 'pending' ),
    );
    return isset( $map[ $source_segment ] ) ? $map[ $source_segment ] : array();
}

add_action( 'wp_ajax_fus_update_user_segments', function() {
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( array( 'message' => 'Unauthorized' ), 403 );
    check_ajax_referer( 'fus_update_user_segments', 'nonce' );

    $source_segment = sanitize_key( isset( $_POST['source_segment'] ) ? $_POST['source_segment'] : '' );
    $target_segment = sanitize_key( isset( $_POST['target_segment'] ) ? $_POST['target_segment'] : '' );
    $user_ids = isset( $_POST['user_ids'] ) && is_array( $_POST['user_ids'] ) ? $_POST['user_ids'] : array();
    $user_ids = array_values( array_filter( array_map( 'absint', $user_ids ) ) );

    if ( ! in_array( $source_segment, array( 'pending', 'testing', 'internal', 'registered' ), true ) ) {
        wp_send_json_error( array( 'message' => 'Invalid source segment.' ), 400 );
    }
    if ( ! in_array( $target_segment, fus_get_segment_transition_targets( $source_segment ), true ) ) {
        wp_send_json_error( array( 'message' => 'Invalid transition target.' ), 400 );
    }
    if ( empty( $user_ids ) ) {
        wp_send_json_error( array( 'message' => 'No users selected.' ), 400 );
    }

    $updated = 0;
    $rejected = array();
    foreach ( $user_ids as $uid ) {
        if ( ! get_userdata( $uid ) ) {
            $rejected[] = array( 'user_id' => $uid, 'reason' => 'User not found' );
            continue;
        }
        if ( ! fus_user_matches_segment( $uid, $source_segment ) ) {
            $rejected[] = array( 'user_id' => $uid, 'reason' => 'User no longer in source segment' );
            continue;
        }
        update_user_meta( $uid, FUS_SEGMENT_OVERRIDE_META, $target_segment );
        $updated++;
    }

    wp_send_json_success( array(
        'updated' => $updated,
        'rejected' => $rejected,
    ) );
} );

// ─────────────────────────────────────────────────────────────────
// 11. AJAX: User Activity Graph
// ─────────────────────────────────────────────────────────────────
add_action('wp_ajax_fus_get_user_activity', function() {
    if (!current_user_can('manage_options')) wp_send_json_error();
    global $wpdb;
    fus_maybe_import_wsal_login_history();
    $user_id = (int)(isset($_GET['user_id']) ? $_GET['user_id'] : 0);
    if (!$user_id) wp_send_json_error();

    $login_events_sub = fus_get_wsal_login_events_subquery();
    if ( $login_events_sub !== '' ) {
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT DATE(ev.event_at) AS dt, COUNT(*) AS cnt
             FROM ({$login_events_sub}) ev
             WHERE ev.user_id = %d
             GROUP BY dt
             ORDER BY dt ASC",
            $user_id
        ) );

        $labels = array(); $data = array();
        if ( empty( $rows ) ) {
            $labels[] = date( 'd M' ); $data[] = 0;
        } else {
            foreach ( $rows as $r ) {
                $labels[] = date( 'd M Y', strtotime( $r->dt ) );
                $data[] = (int) $r->cnt;
            }
        }
        $login_count = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM ({$login_events_sub}) ev WHERE ev.user_id = %d",
            $user_id
        ) );
        if ( $login_count > 0 ) {
            wp_send_json_success(array('labels'=>$labels,'data'=>$data,'login_count'=>$login_count));
        }
    }

    // Use per-day login counters captured on login:
    // usermeta.meta_key = fus_login_log_YYYY-MM-DD, meta_value = login count for that day.
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT
            REPLACE(meta_key, %s, '') AS dt,
            SUM(CAST(meta_value AS UNSIGNED)) AS cnt
         FROM {$wpdb->usermeta}
         WHERE user_id = %d
           AND meta_key LIKE %s
           AND REPLACE(meta_key, %s, '') REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         GROUP BY dt
         ORDER BY dt ASC",
        'fus_login_log_',
        $user_id,
        'fus_login_log_%',
        'fus_login_log_'
    ));

    $labels = array(); $data = array();
    if (empty($rows)) {
        $labels[] = date('d M'); $data[] = 0;
    } else {
        foreach ($rows as $r) { $labels[] = date('d M Y', strtotime($r->dt)); $data[] = (int)$r->cnt; }
    }

    $login_count = (int) get_user_meta($user_id, FUS_LOGIN_COUNT_META, true);
    wp_send_json_success(array('labels'=>$labels,'data'=>$data,'login_count'=>$login_count));
});

// ─────────────────────────────────────────────────────────────────
// 12. AJAX: Live Card Stats
// ─────────────────────────────────────────────────────────────────
add_action('wp_ajax_fus_get_card_stats', function() {
    if (!current_user_can('manage_options')) wp_send_json_error();

    $gperiod    = sanitize_key(isset($_GET['gperiod']) ? $_GET['gperiod'] : '');
    $gdate_from = sanitize_text_field(isset($_GET['gdate_from']) ? $_GET['gdate_from'] : '');
    $gdate_to   = sanitize_text_field(isset($_GET['gdate_to']) ? $_GET['gdate_to'] : '');
    $include_internal = ! ( isset($_GET['include_internal']) && sanitize_text_field($_GET['include_internal']) === '0' );

    if ($gperiod && $gperiod !== 'custom') {
        $gdate_to = date('Y-m-d');
        if      ($gperiod === 'today')      { $gdate_from = date('Y-m-d'); }
        elseif  ($gperiod === 'yesterday')  { $gdate_from = date('Y-m-d', strtotime('-1 day')); $gdate_to = $gdate_from; }
        elseif  ($gperiod === 'last7')      { $gdate_from = date('Y-m-d', strtotime('-6 days')); }
        elseif  ($gperiod === 'last30')     { $gdate_from = date('Y-m-d', strtotime('-29 days')); }
        elseif  ($gperiod === 'thismonth')  { $gdate_from = date('Y-m-01'); }
        elseif  ($gperiod === 'lastmonth')  {
            $gdate_from = date('Y-m-01', strtotime('first day of last month'));
            $gdate_to   = date('Y-m-t',  strtotime('last day of last month'));
        }
    }

    $has_filter    = ($gdate_from !== '' || $gdate_to !== '');
    $gdate_to_eff  = $gdate_to ?: date('Y-m-d');
    $gdate_from_eff = $gdate_from;
    if ($has_filter && !$gdate_from_eff) {
        $gdate_from_eff = $gdate_to_eff;
    }

    $stats = $has_filter ? fus_get_stats_in_period($gdate_from_eff, $gdate_to_eff, $include_internal) : fus_get_stats('', $include_internal);
    $delta = fus_get_stats_deltas(7, $include_internal);

    wp_send_json_success(array(
        'counts' => array(
            'total'      => (int) $stats['total'],
            'testing'    => (int) $stats['testing'],
            'internal'   => (int) $stats['internal'],
            'uploaded'   => (int) $stats['uploaded'],
            'registered' => (int) $stats['registered'],
            'approved'   => (int) $stats['approved'],
            'pending'    => (int) $stats['pending'],
        ),
        'delta' => array(
            'total'      => (int) $delta['total'],
            'testing'    => (int) $delta['testing'],
            'internal'   => (int) $delta['internal'],
            'uploaded'   => 0,
            'registered' => (int) $delta['registered'],
            'approved'   => (int) $delta['approved'],
            'pending'    => (int) $delta['pending'],
        ),
    ));
});

// ─────────────────────────────────────────────────────────────────
// 13. RENDER PAGE
// ─────────────────────────────────────────────────────────────────
function fus_render_page() {
    if (!current_user_can('manage_options')) wp_die('Unauthorized');

    $active_tab  = sanitize_key(isset($_GET['tab'])       ? $_GET['tab']       : 'overview');
    $segment     = sanitize_key(isset($_GET['segment'])   ? $_GET['segment']   : '');
    $zoho_filter = fus_sanitize_zoho_filter( isset($_GET['zoho_filter']) ? $_GET['zoho_filter'] : 'all' );
    $search      = sanitize_text_field(isset($_GET['search'])    ? $_GET['search']    : '');
    $orderby     = sanitize_key(isset($_GET['orderby'])   ? $_GET['orderby']   : 'user_registered');
    $order       = sanitize_key(isset($_GET['order'])     ? $_GET['order']     : 'DESC');
    $paged       = max(1, (int)(isset($_GET['paged']) ? $_GET['paged'] : 1));
    $per_page    = 20;
    $state_chart_payload = 'null';
    $lb_period    = sanitize_key(isset($_GET['lb_period']) ? $_GET['lb_period'] : 'all');
    $lb_date_from = sanitize_text_field(isset($_GET['lb_date_from']) ? $_GET['lb_date_from'] : '');
    $lb_date_to   = sanitize_text_field(isset($_GET['lb_date_to']) ? $_GET['lb_date_to'] : '');
    $lb_paged     = max(1, (int)(isset($_GET['lb_paged']) ? $_GET['lb_paged'] : 1));
    $lb_per_page  = 20;
    $course_period    = sanitize_key(isset($_GET['course_period']) ? $_GET['course_period'] : '');
    $course_date_from = sanitize_text_field(isset($_GET['course_date_from']) ? $_GET['course_date_from'] : '');
    $course_date_to   = sanitize_text_field(isset($_GET['course_date_to']) ? $_GET['course_date_to'] : '');
    $course_id        = absint(isset($_GET['course_id']) ? $_GET['course_id'] : 0);
    $course_paged     = max(1, (int)(isset($_GET['course_paged']) ? $_GET['course_paged'] : 1));
    $course_per_page  = 20;
    $activity_period    = sanitize_key(isset($_GET['activity_period']) ? $_GET['activity_period'] : '');
    $activity_date_from = sanitize_text_field(isset($_GET['activity_date_from']) ? $_GET['activity_date_from'] : '');
    $activity_date_to   = sanitize_text_field(isset($_GET['activity_date_to']) ? $_GET['activity_date_to'] : '');
    $include_internal   = ! ( isset($_GET['include_internal']) && sanitize_text_field($_GET['include_internal']) === '0' );

    // ── Global date filter (for cards) ──
    $gperiod     = sanitize_key(isset($_GET['gperiod'])   ? $_GET['gperiod']   : '');
    $gdate_from  = sanitize_text_field(isset($_GET['gdate_from']) ? $_GET['gdate_from'] : '');
    $gdate_to    = sanitize_text_field(isset($_GET['gdate_to'])   ? $_GET['gdate_to']   : '');

    // Resolve preset period to actual dates
    if ($gperiod && $gperiod !== 'custom') {
        $gdate_to = date('Y-m-d');
        if      ($gperiod === 'today')      { $gdate_from = date('Y-m-d'); }
        elseif  ($gperiod === 'yesterday')  { $gdate_from = date('Y-m-d', strtotime('-1 day')); $gdate_to = $gdate_from; }
        elseif  ($gperiod === 'last7')      { $gdate_from = date('Y-m-d', strtotime('-6 days')); }
        elseif  ($gperiod === 'last30')     { $gdate_from = date('Y-m-d', strtotime('-29 days')); }
        elseif  ($gperiod === 'thismonth')  { $gdate_from = date('Y-m-01'); }
        elseif  ($gperiod === 'lastmonth')  {
            $gdate_from = date('Y-m-01', strtotime('first day of last month'));
            $gdate_to   = date('Y-m-t',  strtotime('last day of last month'));
        }
    }

    $has_global_filter = ($gdate_from !== '' || $gdate_to !== '');
    $gdate_to_eff      = $gdate_to ?: date('Y-m-d');
    $gdate_from_eff    = $gdate_from;
    if ($has_global_filter && !$gdate_from_eff) {
        // Period-only behavior: if only "to" is provided, treat as a single-day range.
        $gdate_from_eff = $gdate_to_eff;
    }

    // ── Table-level date filter (for user list) ──
    $period    = sanitize_key(isset($_GET['period'])    ? $_GET['period']    : '');
    $date_from = sanitize_text_field(isset($_GET['date_from']) ? $_GET['date_from'] : '');
    $date_to   = sanitize_text_field(isset($_GET['date_to'])   ? $_GET['date_to']   : '');

    if ($period && $period !== 'custom') {
        $date_to = date('Y-m-d');
        if      ($period === 'today')      { $date_from = date('Y-m-d'); }
        elseif  ($period === 'yesterday')  { $date_from = date('Y-m-d', strtotime('-1 day')); $date_to = $date_from; }
        elseif  ($period === 'last7')      { $date_from = date('Y-m-d', strtotime('-6 days')); }
        elseif  ($period === 'last30')     { $date_from = date('Y-m-d', strtotime('-29 days')); }
        elseif  ($period === 'thismonth')  { $date_from = date('Y-m-01'); }
        elseif  ($period === 'lastmonth')  {
            $date_from = date('Y-m-01', strtotime('first day of last month'));
            $date_to   = date('Y-m-t',  strtotime('last day of last month'));
        }
    }

    if ($lb_period && $lb_period !== 'custom' && $lb_period !== 'all') {
        $lb_date_to = date('Y-m-d');
        if      ($lb_period === 'today')      { $lb_date_from = date('Y-m-d'); }
        elseif  ($lb_period === 'yesterday')  { $lb_date_from = date('Y-m-d', strtotime('-1 day')); $lb_date_to = $lb_date_from; }
        elseif  ($lb_period === 'last7')      { $lb_date_from = date('Y-m-d', strtotime('-6 days')); }
        elseif  ($lb_period === 'last30')     { $lb_date_from = date('Y-m-d', strtotime('-29 days')); }
        elseif  ($lb_period === 'thismonth')  { $lb_date_from = date('Y-m-01'); }
        elseif  ($lb_period === 'lastmonth')  {
            $lb_date_from = date('Y-m-01', strtotime('first day of last month'));
            $lb_date_to   = date('Y-m-t',  strtotime('last day of last month'));
        }
    } elseif ($lb_period === 'all') {
        $lb_date_from = '';
        $lb_date_to   = '';
    }

    if ($course_period && $course_period !== 'custom') {
        $course_date_to = date('Y-m-d');
        if      ($course_period === 'today')      { $course_date_from = date('Y-m-d'); }
        elseif  ($course_period === 'yesterday')  { $course_date_from = date('Y-m-d', strtotime('-1 day')); $course_date_to = $course_date_from; }
        elseif  ($course_period === 'last7')      { $course_date_from = date('Y-m-d', strtotime('-6 days')); }
        elseif  ($course_period === 'last30')     { $course_date_from = date('Y-m-d', strtotime('-29 days')); }
        elseif  ($course_period === 'thismonth')  { $course_date_from = date('Y-m-01'); }
        elseif  ($course_period === 'lastmonth')  {
            $course_date_from = date('Y-m-01', strtotime('first day of last month'));
            $course_date_to   = date('Y-m-t',  strtotime('last day of last month'));
        }
    }

    if ($activity_period && $activity_period !== 'custom') {
        $activity_date_to = date('Y-m-d');
        if      ($activity_period === 'today')      { $activity_date_from = date('Y-m-d'); }
        elseif  ($activity_period === 'yesterday')  { $activity_date_from = date('Y-m-d', strtotime('-1 day')); $activity_date_to = $activity_date_from; }
        elseif  ($activity_period === 'last7')      { $activity_date_from = date('Y-m-d', strtotime('-6 days')); }
        elseif  ($activity_period === 'last30')     { $activity_date_from = date('Y-m-d', strtotime('-29 days')); }
        elseif  ($activity_period === 'thismonth')  { $activity_date_from = date('Y-m-01'); }
        elseif  ($activity_period === 'lastmonth')  {
            $activity_date_from = date('Y-m-01', strtotime('first day of last month'));
            $activity_date_to   = date('Y-m-t',  strtotime('last day of last month'));
        }
    }

    $activity_has_filter = ($activity_date_from !== '' || $activity_date_to !== '');
    $activity_date_to_eff = $activity_date_to ?: date('Y-m-d');
    $activity_date_from_eff = $activity_date_from;
    if ($activity_has_filter && !$activity_date_from_eff) {
        $activity_date_from_eff = $activity_date_to_eff;
    }
    $activity_query_from = $activity_has_filter ? $activity_date_from_eff : '';
    $activity_query_to   = $activity_has_filter ? $activity_date_to_eff : '';
    $zoho_module = fus_zoho_sanitize_module( isset( $_GET['zoho_module'] ) ? wp_unslash( $_GET['zoho_module'] ) : 'Leads' );
    $zoho_tab_search = sanitize_text_field( isset( $_GET['zoho_tab_search'] ) ? wp_unslash( $_GET['zoho_tab_search'] ) : '' );
    $zoho_tab_paged = max( 1, (int) ( isset( $_GET['zoho_tab_paged'] ) ? $_GET['zoho_tab_paged'] : 1 ) );
    $zoho_tab_per_page = max( 1, min( 50, (int) ( isset( $_GET['zoho_tab_per_page'] ) ? $_GET['zoho_tab_per_page'] : 20 ) ) );
    $zoho_sync_segment = fus_zoho_sanitize_sync_segment( isset( $_GET['zoho_sync_segment'] ) ? wp_unslash( $_GET['zoho_sync_segment'] ) : 'all' );
    $zoho_sync_total = isset( $_GET['zoho_sync_total'] ) ? (int) $_GET['zoho_sync_total'] : 0;
    $zoho_sync_processed = isset( $_GET['zoho_sync_processed'] ) ? (int) $_GET['zoho_sync_processed'] : 0;
    $zoho_sync_synced = isset( $_GET['zoho_sync_synced'] ) ? (int) $_GET['zoho_sync_synced'] : 0;
    $zoho_sync_not_found = isset( $_GET['zoho_sync_not_found'] ) ? (int) $_GET['zoho_sync_not_found'] : 0;
    $zoho_sync_errors = isset( $_GET['zoho_sync_errors'] ) ? (int) $_GET['zoho_sync_errors'] : 0;
    $zoho_sync_offset = isset( $_GET['zoho_sync_offset'] ) ? max( 0, (int) $_GET['zoho_sync_offset'] ) : 0;
    // Zoho tab is WP-user scoped: avoid fetching full CRM lists.
    $zoho_table_data = array(
        'ok' => false,
        'message' => '',
        'rows' => array(),
        'page' => 1,
        'per_page' => $zoho_tab_per_page,
        'more_records' => false,
        'total' => 0,
        'synced' => 0,
        'module' => $zoho_module,
    );
    $zoho_wp_segment_total = 0;
    $zoho_tab_rows = array();
    $zoho_tab_total_rows = 0;
    $zoho_tab_total_pages = 1;
    if ( $active_tab === 'zoho' ) {
        $zoho_sync_query_segment = ( $zoho_sync_segment === 'all' ) ? 'total' : $zoho_sync_segment;
        $zoho_wp_segment_total = count( fus_get_filtered_user_ids( $zoho_sync_query_segment, '', '', '', 'all' ) );
        $zoho_tab_user_data = fus_get_users( $zoho_sync_query_segment, '', '', '', 'user_registered', 'DESC', $zoho_tab_paged, $zoho_tab_per_page, 'all' );
        $zoho_tab_total_rows = isset( $zoho_tab_user_data['total'] ) ? (int) $zoho_tab_user_data['total'] : 0;
        $zoho_tab_rows = isset( $zoho_tab_user_data['rows'] ) && is_array( $zoho_tab_user_data['rows'] ) ? $zoho_tab_user_data['rows'] : array();
        $zoho_tab_total_pages = max( 1, (int) ceil( $zoho_tab_total_rows / $zoho_tab_per_page ) );
        if ( $zoho_tab_paged > $zoho_tab_total_pages ) $zoho_tab_paged = $zoho_tab_total_pages;
    }

    // ── Stats ──
    // No filter: all-time cumulative. Filter active: period-only counts.
    if ($has_global_filter) {
        $stats = fus_get_stats_in_period( $gdate_from_eff, $gdate_to_eff, $include_internal );
    } else {
        $stats = fus_get_stats('', $include_internal);
    }

    // Always show last-7-days delta for the card footer (when no filter active)
    $stats_delta = fus_get_stats_deltas(7, $include_internal);

    $cards = array(
        array('key'=>'total',      'label'=>'Total Sign Up',   'count'=>$stats['total'],      'delta'=>$stats_delta['total'],      'period'=>null),
        array('key'=>'testing',    'label'=>'Testing Account', 'count'=>$stats['testing'],    'delta'=>$stats_delta['testing'],    'period'=>null),
        array('key'=>'internal',   'label'=>'Internal',        'count'=>$stats['internal'],   'delta'=>$stats_delta['internal'],   'period'=>null),
        array('key'=>'uploaded',   'label'=>'Uploaded',        'count'=>$stats['uploaded'],   'delta'=>0,                          'period'=>null),
        array('key'=>'registered', 'label'=>'Registered',      'count'=>$stats['registered'], 'delta'=>$stats_delta['registered'], 'period'=>null),
        array('key'=>'approved',   'label'=>'Approved',        'count'=>$stats['approved'],   'delta'=>$stats_delta['approved'],   'period'=>null),
        array('key'=>'pending',    'label'=>'Pending',         'count'=>$stats['pending'],    'delta'=>$stats_delta['pending'],    'period'=>null),
    );

    $seg_labels = array(
        'total'=>'All Users','testing'=>'Testing Accounts','internal'=>'Internal',
        'uploaded'=>'Uploaded','registered'=>'Registered','approved'=>'Approved','pending'=>'Pending'
    );

    $overview_scope_segment = $segment ? $segment : 'total';
    $zoho_counts = ($active_tab === 'overview') ? fus_get_zoho_bifurcation_counts($overview_scope_segment, $date_from, $date_to, $search) : array('total'=>0,'client'=>0,'lead'=>0,'not_found'=>0,'error'=>0,'pending'=>0);
    $user_data   = ($active_tab === 'overview' && $segment) ? fus_get_users($segment, $date_from, $date_to, $search, $orderby, $order, $paged, $per_page, $zoho_filter) : null;
    $total_rows  = $user_data ? $user_data['total'] : 0;
    $rows        = $user_data ? $user_data['rows']  : array();
    $total_pages = max(1, (int)ceil($total_rows / $per_page));

    $csv_args = array('page'=>'finnovate-user-stats','fus_export'=>'1','segment'=>$segment);
    if ($date_from) $csv_args['date_from'] = $date_from;
    if ($date_to)   $csv_args['date_to']   = $date_to;
    if ($search)    $csv_args['search']    = $search;
    if ($zoho_filter !== 'all') $csv_args['zoho_filter'] = $zoho_filter;
    $csv_args['orderby'] = $orderby; $csv_args['order'] = $order;
    $csv_url = admin_url('admin.php?' . http_build_query($csv_args));
    $lb_data = ($active_tab === 'leaderboard') ? fus_get_leaderboard_users($lb_date_from, $lb_date_to, $lb_paged, $lb_per_page, $include_internal) : array('total'=>0,'rows'=>array());
    $lb_summary = ($active_tab === 'leaderboard') ? fus_get_leaderboard_summary($lb_date_from, $lb_date_to, $include_internal) : array('total_views'=>0,'total_time_spent'=>0,'unique_users'=>0);
    $lb_total_pages = max(1, (int) ceil(((int)$lb_data['total']) / $lb_per_page));
    $lb_rows = $lb_data['rows'];
    $lb_total_rows = (int) $lb_data['total'];
    $lb_export_args = array(
        'page' => 'finnovate-user-stats',
        'fus_export_leaderboard' => '1',
        'lb_period' => $lb_period,
        'include_internal' => $include_internal ? '1' : '0',
    );
    if ($lb_date_from) $lb_export_args['lb_date_from'] = $lb_date_from;
    if ($lb_date_to)   $lb_export_args['lb_date_to'] = $lb_date_to;
    $lb_csv_url = admin_url('admin.php?' . http_build_query($lb_export_args));
    $segment_update_nonce = wp_create_nonce( 'fus_update_user_segments' );
    $login_trend_nonce    = wp_create_nonce( 'fus_login_trend_users' );
    $course_learners_nonce = wp_create_nonce( 'fus_course_learners' );
    $zoho_lookup_nonce = wp_create_nonce( 'fus_zoho_lookup' );
    $zoho_bulk_nonce = wp_create_nonce( 'fus_zoho_bulk' );
    $zoho_raw_nonce = wp_create_nonce( 'fus_zoho_raw' );
    $course_summary = ($active_tab === 'courses') ? fus_get_courses_summary($course_date_from, $course_date_to) : array('totals'=>array('courses'=>0,'enrolled'=>0,'started'=>0,'completed'=>0),'rows'=>array(),'note'=>'');
    $course_rows = isset($course_summary['rows']) && is_array($course_summary['rows']) ? $course_summary['rows'] : array();
    $course_totals = isset($course_summary['totals']) && is_array($course_summary['totals']) ? $course_summary['totals'] : array('courses'=>0,'enrolled'=>0,'started'=>0,'completed'=>0);
    $course_note = isset($course_summary['note']) ? (string) $course_summary['note'] : '';
    $course_selected = ($active_tab === 'courses' && $course_id > 0) ? fus_get_course_learners($course_id, $course_date_from, $course_date_to, $course_paged, $course_per_page) : array('total'=>0,'rows'=>array(),'note'=>'','course_title'=>'');
    $course_total_pages = max(1, (int) ceil(((int) (isset($course_selected['total']) ? $course_selected['total'] : 0)) / $course_per_page));
    $activity_summary = ($active_tab === 'activity') ? fus_get_postlogin_summary($activity_query_from, $activity_query_to) : array('total_views'=>0,'unique_users'=>0,'avg_time_view'=>0,'views_per_user'=>0,'avg_time_user'=>0,'views_last_24h'=>0);
    $activity_top_posts = ($active_tab === 'activity') ? fus_get_postlogin_top_posts($activity_query_from, $activity_query_to, 20) : array();
    $activity_recent = ($active_tab === 'activity') ? fus_get_postlogin_recent_views($activity_query_from, $activity_query_to, 50) : array();

    // Period label for display
    $period_display = '';
    if ($has_global_filter) {
        if ($gdate_from && $gdate_to_eff) {
            $period_display = date('d M Y', strtotime($gdate_from)) . ' – ' . date('d M Y', strtotime($gdate_to_eff));
        } elseif ($gdate_to_eff) {
            $period_display = 'Up to ' . date('d M Y', strtotime($gdate_to_eff));
        }
    }

    // ── OUTPUT ──
    echo '<div id="fus-wrap' . ($has_global_filter ? ' fus-date-filtered' : '') . '">';
    echo '<h1>User Activity Stats</h1>';
    echo '<p class="fus-subtitle">Live data &nbsp;&bull;&nbsp; ' . esc_html(current_time('F j, Y \a\t g:i A')) . ' &nbsp;<a href="' . esc_url(fus_build_url(array('paged'=>1))) . '">&#8635; Refresh</a></p>';

    // Tabs
    $tabs = array(
        'overview'=>'Overview',
        'logins'=>'Login Trends',
        'states'=>'State Councils',
        'courses'=>'Courses',
        'leaderboard'=>'Leaderboard',
        'activity'=>'Post login Activities',
        'prelogin'=>'Pre-Login Tracker',
        'zoho'=>'Zoho CRM'
    );
    echo '<div class="fus-tabs">';
    foreach ($tabs as $tab_key => $tab_label) {
        $tab_class = ($active_tab === $tab_key) ? ' active' : '';
        echo '<a href="' . esc_url(fus_build_url(array('tab'=>$tab_key,'segment'=>'','paged'=>1))) . '" class="fus-tab' . $tab_class . '">' . esc_html($tab_label) . '</a>';
    }
    echo '</div>';

    if ( in_array($active_tab, array('overview', 'logins', 'leaderboard'), true) ) {
        echo '<div class="fus-filters" style="margin-bottom:14px;">';
        echo '<label style="margin-right:8px;">Default</label>';
        echo '<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;text-transform:none;letter-spacing:0;color:#1d1d1f;">';
        echo '<input type="checkbox" id="fus-include-internal" value="1" ' . ( $include_internal ? 'checked' : '' ) . ' onchange="fusToggleIncludeInternal(this.checked)">';
        echo 'Include Internal';
        echo '</label>';
        echo '</div>';
    }

    // ══════════════════════════════════════════
    // TAB: ZOHO OAUTH
    // ══════════════════════════════════════════
    if ( $active_tab === 'zoho' ) {
        $zoho = fus_get_zoho_oauth_settings();
        $zoho_msg = sanitize_key( isset( $_GET['zoho_msg'] ) ? $_GET['zoho_msg'] : '' );
        $zoho_err = sanitize_text_field( isset( $_GET['zoho_err'] ) ? rawurldecode( wp_unslash( $_GET['zoho_err'] ) ) : '' );
        $now_ts = time();
        $expires_in_display = ( (int) $zoho['expires_at'] > 0 ) ? max( 0, (int) $zoho['expires_at'] - $now_ts ) : 0;
        $masked_token = '';
        if ( ! empty( $zoho['access_token'] ) ) {
            $token = (string) $zoho['access_token'];
            $masked_token = ( strlen( $token ) > 14 ) ? ( substr( $token, 0, 8 ) . '...' . substr( $token, -6 ) ) : $token;
        }

        if ( $zoho_msg === 'saved' ) {
            echo '<div style="margin-bottom:12px;background:#ecfdf3;border:1px solid #bbf7d0;color:#166534;padding:10px 12px;border-radius:10px;font-size:13px;">Zoho OAuth settings saved.</div>';
        } elseif ( $zoho_msg === 'refreshed' ) {
            echo '<div style="margin-bottom:12px;background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;padding:10px 12px;border-radius:10px;font-size:13px;">Zoho access token refreshed.</div>';
        } elseif ( $zoho_msg === 'sync_stopped' ) {
            echo '<div style="margin-bottom:12px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;padding:10px 12px;border-radius:10px;font-size:13px;">Sync stopped. You can resume anytime using Continue Sync.</div>';
        } elseif ( $zoho_msg === 'sync_partial' ) {
            echo '<div style="margin-bottom:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;padding:10px 12px;border-radius:10px;font-size:13px;">';
            echo 'Sync in progress. Segment: <strong>' . esc_html( ucfirst( $zoho_sync_segment ) ) . '</strong> &nbsp;|&nbsp; Total users: <strong>' . number_format( $zoho_sync_total ) . '</strong> &nbsp;|&nbsp; Processed: <strong>' . number_format( $zoho_sync_processed ) . '</strong> &nbsp;|&nbsp; Synced: <strong>' . number_format( $zoho_sync_synced ) . '</strong> &nbsp;|&nbsp; Not found: <strong>' . number_format( $zoho_sync_not_found ) . '</strong> &nbsp;|&nbsp; Errors: <strong>' . number_format( $zoho_sync_errors ) . '</strong>';
            echo '</div>';
        } elseif ( $zoho_msg === 'sync_done' ) {
            echo '<div style="margin-bottom:12px;background:#ecfdf3;border:1px solid #bbf7d0;color:#166534;padding:10px 12px;border-radius:10px;font-size:13px;">';
            echo 'Sync completed. Segment: <strong>' . esc_html( ucfirst( $zoho_sync_segment ) ) . '</strong> &nbsp;|&nbsp; Total users: <strong>' . number_format( $zoho_sync_total ) . '</strong> &nbsp;|&nbsp; Processed: <strong>' . number_format( $zoho_sync_processed ) . '</strong> &nbsp;|&nbsp; Synced: <strong>' . number_format( $zoho_sync_synced ) . '</strong> &nbsp;|&nbsp; Not found: <strong>' . number_format( $zoho_sync_not_found ) . '</strong> &nbsp;|&nbsp; Errors: <strong>' . number_format( $zoho_sync_errors ) . '</strong>';
            echo '</div>';
        } elseif ( $zoho_msg === 'error' ) {
            $msg = $zoho_err ? $zoho_err : ( ! empty( $zoho['last_error'] ) ? (string) $zoho['last_error'] : 'Unable to refresh Zoho access token.' );
            echo '<div style="margin-bottom:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:10px 12px;border-radius:10px;font-size:13px;">' . esc_html( $msg ) . '</div>';
        }

        echo '<details class="fus-apple-collapse" style="margin-bottom:14px;">';
        echo '<summary>Zoho OAuth Token Settings</summary>';
        echo '<div class="fus-apple-collapse-body">';
        echo '<p class="fus-zoho-oauth-note">Add Zoho OAuth credentials and refresh token, then generate an access token for CRM API calls.</p>';

        echo '<form method="post" class="fus-zoho-oauth-form" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
        echo '<input type="hidden" name="action" value="fus_save_zoho_oauth">';
        wp_nonce_field( 'fus_save_zoho_oauth' );

        echo '<div class="fus-zoho-oauth-field"><label>Zoho Accounts URL</label><input type="url" name="accounts_url" value="' . esc_attr( $zoho['accounts_url'] ) . '" placeholder="https://accounts.zoho.com"></div>';
        echo '<div class="fus-zoho-oauth-field"><label>Zoho API Domain (optional)</label><input type="text" name="api_domain" value="' . esc_attr( $zoho['api_domain'] ) . '" placeholder="https://www.zohoapis.com"></div>';
        echo '<div class="fus-zoho-oauth-field"><label>Client ID</label><input type="text" name="client_id" value="' . esc_attr( $zoho['client_id'] ) . '"></div>';
        echo '<div class="fus-zoho-oauth-field"><label>Client Secret</label><input type="password" name="client_secret" value="" placeholder="' . ( $zoho['client_secret'] ? 'Saved (leave blank to keep)' : 'Enter client secret' ) . '"></div>';
        echo '<div class="fus-zoho-oauth-field full"><label>Refresh Token</label><input type="password" name="refresh_token" value="" placeholder="' . ( $zoho['refresh_token'] ? 'Saved (leave blank to keep)' : 'Enter refresh token' ) . '"></div>';
        echo '<div class="fus-zoho-oauth-actions"><button type="submit" class="fus-btn">Save Settings</button></div>';
        echo '</form>';

        echo '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">';
        echo '<div class="fus-zoho-token-meta">';
        echo '<div class="fus-zoho-token-card"><div class="label">Last Refreshed</div><div class="value">' . ( $zoho['last_refreshed_at'] ? esc_html( date_i18n( 'd M Y, g:i A', (int) $zoho['last_refreshed_at'] ) ) : 'Never' ) . '</div></div>';
        echo '<div class="fus-zoho-token-card"><div class="label">Token Expires In</div><div class="value">' . ( $zoho['expires_at'] ? esc_html( gmdate( 'H:i:s', $expires_in_display ) ) : 'Unknown' ) . '</div></div>';
        echo '<div class="fus-zoho-token-card token"><div class="label">Current Access Token</div><div class="value fus-mono">' . esc_html( $masked_token ? $masked_token : 'Not generated yet' ) . '</div></div>';
        echo '</div>';
        echo '<form method="post" class="fus-zoho-refresh-form" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
        echo '<input type="hidden" name="action" value="fus_refresh_zoho_token">';
        wp_nonce_field( 'fus_refresh_zoho_token' );
        echo '<button type="submit" class="fus-btn">Generate Access Token</button>';
        echo '</form>';
        echo '</div></details>';

        $zoho_sync_pills = array(
            'all' => 'All',
            'registered' => 'Registered',
            'uploaded' => 'Uploaded',
            'internal' => 'Internal',
            'testing' => 'Testing',
        );
        echo '<div class="fus-zoho-pill-row">';
        echo '<span class="fus-inline-msg" style="font-weight:700;color:#475569;padding:6px 2px;">WP segment for sync:</span>';
        foreach ( $zoho_sync_pills as $seg_key => $seg_label ) {
            $pill_url = fus_build_url( array(
                'tab' => 'zoho',
                'zoho_sync_segment' => $seg_key,
                'zoho_tab_paged' => 1,
            ) );
            $active = ( $zoho_sync_segment === $seg_key ) ? ' active' : '';
            echo '<a href="' . esc_url( $pill_url ) . '" class="fus-zoho-pill' . $active . '">' . esc_html( $seg_label ) . '</a>';
        }
        echo '</div>';

        echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="margin:-4px 0 12px;">';
        echo '<input type="hidden" name="action" value="fus_sync_zoho_wp_users">';
        echo '<input type="hidden" name="zoho_sync_segment" value="' . esc_attr( $zoho_sync_segment ) . '">';
        echo '<input type="hidden" name="zoho_module" value="' . esc_attr( $zoho_module ) . '">';
        echo '<input type="hidden" name="zoho_tab_search" value="' . esc_attr( $zoho_tab_search ) . '">';
        echo '<input type="hidden" name="zoho_tab_per_page" value="' . (int) $zoho_tab_per_page . '">';
        echo '<input type="hidden" name="zoho_sync_offset" value="0">';
        echo '<input type="hidden" name="zoho_sync_processed" value="0">';
        echo '<input type="hidden" name="zoho_sync_synced" value="0">';
        echo '<input type="hidden" name="zoho_sync_not_found" value="0">';
        echo '<input type="hidden" name="zoho_sync_errors" value="0">';
        wp_nonce_field( 'fus_sync_zoho_wp_users' );
        echo '<button type="submit" class="fus-btn">Sync All WordPress Users (' . esc_html( ucfirst( $zoho_sync_segment ) ) . ': ' . number_format( (int) $zoho_wp_segment_total ) . ')</button>';
        $zoho_last_sync_map = get_option( FUS_ZOHO_LAST_SYNC_AT_OPTION, array() );
        $zoho_last_sync_at = ( is_array( $zoho_last_sync_map ) && isset( $zoho_last_sync_map[ $zoho_sync_segment ] ) ) ? (int) $zoho_last_sync_map[ $zoho_sync_segment ] : 0;
        $zoho_last_sync_text = $zoho_last_sync_at > 0 ? human_time_diff( $zoho_last_sync_at, time() ) . ' ago' : 'Never';
        echo '<span class="fus-inline-msg" style="margin-left:8px;">Last Checked: ' . esc_html( $zoho_last_sync_text ) . '</span>';
        echo '</form>';
        if ( $zoho_msg === 'sync_partial' && $zoho_sync_offset > 0 && $zoho_sync_offset < $zoho_sync_total ) {
            echo '<form method="post" id="fus-zoho-continue-sync-form" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="margin:-4px 0 12px;">';
            echo '<input type="hidden" name="action" value="fus_sync_zoho_wp_users">';
            echo '<input type="hidden" name="zoho_sync_segment" value="' . esc_attr( $zoho_sync_segment ) . '">';
            echo '<input type="hidden" name="zoho_module" value="' . esc_attr( $zoho_module ) . '">';
            echo '<input type="hidden" name="zoho_tab_search" value="' . esc_attr( $zoho_tab_search ) . '">';
            echo '<input type="hidden" name="zoho_tab_per_page" value="' . (int) $zoho_tab_per_page . '">';
            echo '<input type="hidden" name="zoho_sync_offset" value="' . (int) $zoho_sync_offset . '">';
            echo '<input type="hidden" name="zoho_sync_processed" value="' . (int) $zoho_sync_processed . '">';
            echo '<input type="hidden" name="zoho_sync_synced" value="' . (int) $zoho_sync_synced . '">';
            echo '<input type="hidden" name="zoho_sync_not_found" value="' . (int) $zoho_sync_not_found . '">';
            echo '<input type="hidden" name="zoho_sync_errors" value="' . (int) $zoho_sync_errors . '">';
            wp_nonce_field( 'fus_sync_zoho_wp_users' );
            $stop_url = fus_build_url( array(
                'tab' => 'zoho',
                'zoho_msg' => 'sync_stopped',
                'zoho_sync_segment' => $zoho_sync_segment,
                'zoho_module' => $zoho_module,
                'zoho_tab_search' => $zoho_tab_search,
                'zoho_tab_per_page' => $zoho_tab_per_page,
                'zoho_tab_paged' => $zoho_tab_paged,
                'zoho_sync_total' => $zoho_sync_total,
                'zoho_sync_processed' => $zoho_sync_processed,
                'zoho_sync_synced' => $zoho_sync_synced,
                'zoho_sync_not_found' => $zoho_sync_not_found,
                'zoho_sync_errors' => $zoho_sync_errors,
                'zoho_sync_offset' => $zoho_sync_offset,
            ) );
            echo '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">';
            echo '<button type="submit" class="fus-btn-secondary">Continue Sync (' . number_format( (int) $zoho_sync_offset ) . ' / ' . number_format( (int) $zoho_sync_total ) . ' processed)</button>';
            echo '<a href="' . esc_url( $stop_url ) . '" class="fus-btn-secondary" style="border-color:#fecaca;background:#fff1f2;color:#b91c1c;">Stop Sync</a>';
            echo '</div>';
            echo '</form>';
            echo '<script>setTimeout(function(){var f=document.getElementById("fus-zoho-continue-sync-form");if(f){f.submit();}},500);</script>';
        }

        $last_run_done = in_array( $zoho_msg, array( 'sync_done', 'sync_partial' ), true );
        echo '<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px;">';
        foreach ( array(
            array( 'WP Users In Segment', (int) $zoho_wp_segment_total, '#0ea5e9' ),
            array( 'Processed (Last Run)', $last_run_done ? (int) $zoho_sync_processed : 0, '#0071e3' ),
            array( 'Synced (Last Run)', $last_run_done ? (int) $zoho_sync_synced : 0, '#10b981' ),
            array( 'Not Found (Last Run)', $last_run_done ? (int) $zoho_sync_not_found : 0, '#f59e0b' ),
            array( 'Errors (Last Run)', $last_run_done ? (int) $zoho_sync_errors : 0, '#ef4444' ),
        ) as $mini ) {
            echo '<div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:16px 18px;">';
            echo '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:8px;">' . esc_html( $mini[0] ) . '</div>';
            echo '<div style="font-size:30px;font-weight:700;color:' . esc_attr( $mini[2] ) . ';letter-spacing:-0.5px;">' . number_format( (int) $mini[1] ) . '</div>';
            echo '</div>';
        }
        echo '</div>';
        echo '<div class="fus-filters" style="margin-bottom:10px;">';
        echo '<span class="fus-inline-msg" style="font-weight:700;color:#334155;">Synced users table (' . number_format( (int) $zoho_tab_total_rows ) . ')</span>';
        echo '<button type="button" id="fus-zoho-fetch-raw-btn" class="fus-btn-secondary" onclick="fusFetchZohoRawForSelected()">Fetch Raw Zoho Data</button>';
        echo '<form method="get" action="' . esc_url( admin_url( 'admin.php' ) ) . '" style="display:inline-flex;align-items:center;gap:8px;margin-left:auto;">';
        echo '<input type="hidden" name="page" value="finnovate-user-stats">';
        echo '<input type="hidden" name="tab" value="zoho">';
        echo '<input type="hidden" name="zoho_sync_segment" value="' . esc_attr( $zoho_sync_segment ) . '">';
        echo '<label for="zoho_tab_per_page" style="margin:0;">Rows</label>';
        echo '<select id="zoho_tab_per_page" name="zoho_tab_per_page" class="fus-apple-select" onchange="this.form.submit()">';
        foreach ( array( 10, 20, 50 ) as $pp ) {
            echo '<option value="' . (int) $pp . '"' . selected( $zoho_tab_per_page, $pp, false ) . '>' . (int) $pp . '</option>';
        }
        echo '</select>';
        echo '<input type="hidden" name="zoho_tab_paged" value="1">';
        echo '</form>';
        echo '</div>';
        echo '<div class="fus-table-wrap"><table class="fus-table" id="fus-zoho-table"><thead><tr>';
        echo '<th>Select</th><th>#</th>';
        echo '<th><button type="button" class="fus-zoho-sort-btn" data-col="2" data-sort="text">Name <span class="fus-zoho-sort-arrow">↕</span></button></th>';
        echo '<th><button type="button" class="fus-zoho-sort-btn" data-col="3" data-sort="text">Email <span class="fus-zoho-sort-arrow">↕</span></button></th>';
        echo '<th><button type="button" class="fus-zoho-sort-btn" data-col="4" data-sort="text">Zoho Status <span class="fus-zoho-sort-arrow">↕</span></button></th>';
        echo '<th><button type="button" class="fus-zoho-sort-btn" data-col="5" data-sort="text">Origin <span class="fus-zoho-sort-arrow">↕</span></button></th>';
        echo '<th><button type="button" class="fus-zoho-sort-btn" data-col="6" data-sort="text">Lead Source <span class="fus-zoho-sort-arrow">↕</span></button></th>';
        echo '<th><button type="button" class="fus-zoho-sort-btn" data-col="7" data-sort="text">Branch <span class="fus-zoho-sort-arrow">↕</span></button></th>';
        echo '<th><button type="button" class="fus-zoho-sort-btn" data-col="8" data-sort="text">Owner <span class="fus-zoho-sort-arrow">↕</span></button></th>';
        echo '</tr></thead><tbody>';
        if ( ! empty( $zoho_tab_rows ) ) {
            $z_n = ( ( $zoho_tab_paged - 1 ) * $zoho_tab_per_page ) + 1;
            foreach ( $zoho_tab_rows as $z_row ) {
                $z_uid = isset( $z_row->ID ) ? (int) $z_row->ID : 0;
                $z_name = isset( $z_row->display_name ) ? (string) $z_row->display_name : '';
                $z_email = isset( $z_row->user_email ) ? (string) $z_row->user_email : '';
                $z_cached = fus_get_zoho_cached_status( $z_uid );
                $z_type = isset( $z_cached['type'] ) ? (string) $z_cached['type'] : 'pending';
                $z_label_map = array(
                    'client' => 'Client',
                    'lead' => 'Lead',
                    'not_found' => 'Not Found',
                    'error' => 'Error',
                    'pending' => 'Pending',
                );
                $z_label = isset( $z_label_map[ $z_type ] ) ? $z_label_map[ $z_type ] : 'Pending';
                $z_origin = (string) get_user_meta( $z_uid, FUS_ZOHO_ORIGIN_META, true );
                $z_lead_source = (string) get_user_meta( $z_uid, FUS_ZOHO_LEAD_SOURCE_META, true );
                $z_branch = (string) get_user_meta( $z_uid, FUS_ZOHO_BRANCH_META, true );
                $z_lead_owner = (string) get_user_meta( $z_uid, FUS_ZOHO_LEAD_OWNER_META, true );
                $z_owner_display = $z_lead_owner;
                echo '<tr>';
                echo '<td><input type="radio" name="fus_zoho_selected_user" class="fus-zoho-selected-user" value="' . (int) $z_uid . '"></td>';
                echo '<td style="color:#94a3b8;">' . (int) $z_n++ . '</td>';
                echo '<td><strong>' . esc_html( $z_name ) . '</strong></td>';
                echo '<td class="fus-mono">' . esc_html( $z_email ) . '</td>';
                echo '<td><span class="fus-status ' . esc_attr( $z_type === 'client' ? 'fus-status-client' : ( $z_type === 'lead' ? 'fus-status-lead' : 'fus-status-unknown' ) ) . '">' . esc_html( $z_label ) . '</span></td>';
                echo '<td>' . ( $z_origin !== '' ? esc_html( $z_origin ) : '<span class="fus-nil">&mdash;</span>' ) . '</td>';
                echo '<td>' . ( $z_lead_source !== '' ? esc_html( $z_lead_source ) : '<span class="fus-nil">&mdash;</span>' ) . '</td>';
                echo '<td>' . ( $z_branch !== '' ? esc_html( $z_branch ) : '<span class="fus-nil">&mdash;</span>' ) . '</td>';
                echo '<td>' . ( $z_owner_display !== '' ? esc_html( $z_owner_display ) : '<span class="fus-nil">&mdash;</span>' ) . '</td>';
                echo '</tr>';
            }
        } else {
            echo '<tr><td colspan="9" style="text-align:center;padding:32px;color:#94a3b8;">No users found for this segment.</td></tr>';
        }
        echo '</tbody></table></div>';
        if ( $zoho_tab_total_pages > 1 ) {
            echo '<div class="fus-pagination">';
            if ( $zoho_tab_paged > 1 ) {
                echo '<a href="' . esc_url( fus_build_url( array( 'tab' => 'zoho', 'zoho_sync_segment' => $zoho_sync_segment, 'zoho_tab_per_page' => $zoho_tab_per_page, 'zoho_tab_paged' => 1 ) ) ) . '">&laquo;</a>';
                echo '<a href="' . esc_url( fus_build_url( array( 'tab' => 'zoho', 'zoho_sync_segment' => $zoho_sync_segment, 'zoho_tab_per_page' => $zoho_tab_per_page, 'zoho_tab_paged' => $zoho_tab_paged - 1 ) ) ) . '">&lsaquo;</a>';
            }
            for ( $zp = max( 1, $zoho_tab_paged - 2 ); $zp <= min( $zoho_tab_total_pages, $zoho_tab_paged + 2 ); $zp++ ) {
                if ( $zp === (int) $zoho_tab_paged ) {
                    echo '<strong>' . (int) $zp . '</strong>';
                } else {
                    echo '<a href="' . esc_url( fus_build_url( array( 'tab' => 'zoho', 'zoho_sync_segment' => $zoho_sync_segment, 'zoho_tab_per_page' => $zoho_tab_per_page, 'zoho_tab_paged' => $zp ) ) ) . '">' . (int) $zp . '</a>';
                }
            }
            if ( $zoho_tab_paged < $zoho_tab_total_pages ) {
                echo '<a href="' . esc_url( fus_build_url( array( 'tab' => 'zoho', 'zoho_sync_segment' => $zoho_sync_segment, 'zoho_tab_per_page' => $zoho_tab_per_page, 'zoho_tab_paged' => $zoho_tab_paged + 1 ) ) ) . '">&rsaquo;</a>';
                echo '<a href="' . esc_url( fus_build_url( array( 'tab' => 'zoho', 'zoho_sync_segment' => $zoho_sync_segment, 'zoho_tab_per_page' => $zoho_tab_per_page, 'zoho_tab_paged' => $zoho_tab_total_pages ) ) ) . '">&raquo;</a>';
            }
            echo '<span>Page ' . (int) $zoho_tab_paged . ' of ' . (int) $zoho_tab_total_pages . ' &nbsp;(' . number_format( (int) $zoho_tab_total_rows ) . ' total)</span>';
            echo '</div>';
        }

    // ══════════════════════════════════════════
    // TAB: OVERVIEW
    // ══════════════════════════════════════════
    } elseif ($active_tab === 'overview') {

        // ── Global Date Filter Bar ──
        echo '<form method="GET" action="' . esc_url(admin_url('admin.php')) . '" id="fus-global-filter-form">';
        echo '<input type="hidden" name="page" value="finnovate-user-stats">';
        echo '<input type="hidden" name="tab" value="overview">';
        echo '<input type="hidden" name="include_internal" value="' . ( $include_internal ? '1' : '0' ) . '">';
        if ($segment) echo '<input type="hidden" name="segment" value="' . esc_attr($segment) . '">';
        echo '<div class="fus-global-filter">';
        echo '<span class="fus-global-filter-label">Filter Cards By Date</span>';
        echo '<div class="fus-global-filter-sep"></div>';
        echo '<select name="gperiod" id="fus-gperiod" onchange="fusGperiodChange(this.value)">';
        $gpopts = array(''=>'All Time (Default)','today'=>'Today','yesterday'=>'Yesterday','last7'=>'Last 7 Days','last30'=>'Last 30 Days','thismonth'=>'This Month','lastmonth'=>'Last Month','custom'=>'Custom Range');
        foreach ($gpopts as $val => $lbl) {
            echo '<option value="' . esc_attr($val) . '"' . ($gperiod === $val ? ' selected' : '') . '>' . esc_html($lbl) . '</option>';
        }
        echo '</select>';

        $gcvis = ($gperiod === 'custom') ? '' : 'display:none;';
        echo '<span id="fus-gcustom" style="display:flex;align-items:center;gap:8px;' . $gcvis . '">';
        echo '<label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;">From</label>';
        echo '<input type="date" name="gdate_from" value="' . esc_attr($gdate_from) . '" style="font-size:13px;border:1.5px solid #e2e8f0;border-radius:7px;padding:6px 10px;">';
        echo '<label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;">To</label>';
        echo '<input type="date" name="gdate_to" value="' . esc_attr($gdate_to) . '" style="font-size:13px;border:1.5px solid #e2e8f0;border-radius:7px;padding:6px 10px;">';
        echo '</span>';

        echo '<button type="submit" class="fus-btn" style="padding:7px 16px;">Apply</button>';

        if ($has_global_filter) {
            echo '<span class="fus-filter-active-badge">' . esc_html($period_display) . '</span>';
            $clear_url = fus_build_url(array('gperiod'=>'','gdate_from'=>'','gdate_to'=>'','paged'=>1));
            echo '<button type="button" class="fus-btn-clear" onclick="window.location=\'' . esc_url($clear_url) . '\'">&#x2715; Clear filter</button>';
        }

        echo '</div></form>';

        // ── Cards ──
        echo '<div class="fus-grid">';
        foreach ($cards as $c) {
            $active   = ($segment === $c['key']) ? ' active' : '';
            $card_url = fus_build_url(array('segment'=>$c['key'],'paged'=>1,'tab'=>'overview'));
            $delta_class = ((int)$c['delta'] > 0) ? '' : ' zero';

            echo '<a href="' . esc_url($card_url) . '" class="fus-card fus-' . esc_attr($c['key']) . esc_attr($active) . '">';
            echo '<div class="fus-label">' . esc_html($c['label']) . '</div>';
            echo '<div class="fus-number">' . number_format($c['count']) . '</div>';

            // Period new-signups (only shows when date filter active, via CSS)
            if ($c['period'] !== null) {
                echo '<div class="fus-period-count">+' . number_format((int)$c['period']) . ' new</div>';
                echo '<div class="fus-period-label">in selected period</div>';
            }

            // Last-7-days delta (hidden when date filter active, via CSS)
            echo '<div class="fus-delta"><strong class="' . $delta_class . '">+' . number_format((int)$c['delta']) . '</strong> &nbsp;last 7 days</div>';
            echo '</a>';
        }
        echo '</div>';

        $zoho_scope_label = $segment ? ( isset($seg_labels[$segment]) ? $seg_labels[$segment] : ucfirst($segment) ) : 'All Users';
        echo '<div class="fus-zoho-pill-row">';
        echo '<span class="fus-inline-msg" style="font-weight:700;color:#475569;padding:6px 2px;">Zoho bifurcation (' . esc_html($zoho_scope_label) . '):</span>';
        $zoho_pills = array(
            'all' => array( 'label' => 'All', 'count' => (int) $zoho_counts['total'] ),
            'client' => array( 'label' => 'Client', 'count' => (int) $zoho_counts['client'] ),
            'lead' => array( 'label' => 'Lead', 'count' => (int) $zoho_counts['lead'] ),
            'not_found' => array( 'label' => 'Not Found', 'count' => (int) $zoho_counts['not_found'] ),
            'error' => array( 'label' => 'Error', 'count' => (int) $zoho_counts['error'] ),
            'pending' => array( 'label' => 'Pending', 'count' => (int) $zoho_counts['pending'] ),
        );
        foreach ( $zoho_pills as $zkey => $zmeta ) {
            $is_active = ( $zoho_filter === $zkey );
            $pill_url = fus_build_url( array(
                'tab' => 'overview',
                'segment' => $overview_scope_segment,
                'zoho_filter' => $zkey,
                'paged' => 1,
            ) );
            echo '<a href="' . esc_url( $pill_url ) . '" class="fus-zoho-pill' . ( $is_active ? ' active' : '' ) . '">';
            echo esc_html( $zmeta['label'] ) . ': ' . number_format( (int) $zmeta['count'] );
            echo '</a>';
        }
        echo '</div>';

        if ($has_global_filter && $period_display) {
            echo '<p style="font-size:12px;color:#6e6e73;margin:-10px 0 18px;padding:10px 14px;background:#ffffffc7;border-radius:12px;border:1px solid #d2d2d7;box-shadow:0 1px 2px rgba(0,0,0,.04);">';
            echo '&#x2139; Card totals show users in this selected period: <strong>' . esc_html(date('d M Y', strtotime($gdate_from_eff))) . '</strong> to <strong>' . esc_html(date('d M Y', strtotime($gdate_to_eff))) . '</strong>.';
            echo '</p>';
        }

        // MoM Graph button (always visible)
        echo '<div style="margin-bottom:20px;">';
        echo '<button type="button" onclick="fusOpenMoM()" style="display:inline-flex;align-items:center;gap:8px;background:#0071e3;color:#fff;border:none;border-radius:980px;padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer;font-family:\'Inter\',-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',Arial,sans-serif;">Month-on-Month Growth</button>';
        echo '</div>';

        if ($segment) {
            // Filters
            echo '<form method="GET" action="' . esc_url(admin_url('admin.php')) . '">';
            echo '<input type="hidden" name="page" value="finnovate-user-stats">';
            echo '<input type="hidden" name="segment" value="' . esc_attr($segment) . '">';
            echo '<input type="hidden" name="tab" value="overview">';
            echo '<input type="hidden" name="include_internal" value="' . ( $include_internal ? '1' : '0' ) . '">';
            echo '<input type="hidden" name="zoho_filter" value="' . esc_attr($zoho_filter) . '">';
            echo '<div class="fus-filters">';
            echo '<label>Period</label>';
            echo '<select name="period" id="fus-period" onchange="fusPeriodChange(this.value)">';
            $popts = array(''=>'All Time','today'=>'Today','yesterday'=>'Yesterday','last7'=>'Last 7 Days','last30'=>'Last 30 Days','thismonth'=>'This Month','lastmonth'=>'Last Month','custom'=>'Custom Range');
            foreach ($popts as $val => $lbl) {
                echo '<option value="' . esc_attr($val) . '"' . ($period === $val ? ' selected' : '') . '>' . esc_html($lbl) . '</option>';
            }
            echo '</select>';

            $cvis = ($period === 'custom') ? ' visible' : '';
            echo '<span class="fus-custom-dates' . $cvis . '" id="fus-custom-dates">';
            echo '<label>From</label><input type="date" name="date_from" value="' . esc_attr($date_from) . '">';
            echo '<label>To</label><input type="date" name="date_to" value="' . esc_attr($date_to) . '">';
            echo '</span>';

            echo '<label>Search</label>';
            echo '<input type="text" name="search" value="' . esc_attr($search) . '" placeholder="Name, email&hellip;" style="width:180px;">';
            echo '<button type="submit" class="fus-btn">Apply</button>';
            if ($period || $search) {
                echo '<a href="' . esc_url(fus_build_url(array('period'=>'','date_from'=>'','date_to'=>'','search'=>'','paged'=>1,'tab'=>'overview'))) . '" class="fus-btn-secondary">Clear</a>';
            }
            echo '<a href="' . esc_url($csv_url) . '" class="fus-btn-csv">Export CSV</a>';
            echo '</div></form>';

            // Table
            $seg_label = isset($seg_labels[$segment]) ? $seg_labels[$segment] : $segment;
            echo '<h2 style="font-size:16px;font-weight:700;margin-bottom:12px;letter-spacing:-0.3px;">' . esc_html($seg_label) . ' <span style="font-size:13px;color:#94a3b8;font-weight:400;">(' . number_format($total_rows) . ' users)</span></h2>';

            $segment_targets = fus_get_segment_transition_targets( $segment );
            $show_batch_controls = ! empty( $segment_targets );
            if ( ! empty( $segment_targets ) ) {
                $target_labels = array(
                    'testing' => 'Move to Testing',
                    'internal' => 'Move to Internal',
                    'registered' => 'Move to Registered',
                    'pending' => 'Move to Pending',
                );
                echo '<div class="fus-batch-actions">';
                echo '<select id="fus-segment-batch-target" class="fus-apple-select">';
                echo '<option value="">Select action</option>';
                foreach ( $segment_targets as $target ) {
                    echo '<option value="' . esc_attr( $target ) . '">' . esc_html( isset( $target_labels[ $target ] ) ? $target_labels[ $target ] : $target ) . '</option>';
                }
                echo '</select>';
                echo '<button type="button" class="fus-btn" onclick="fusApplySegmentBatch(\'' . esc_js( $segment ) . '\')">Apply</button>';
                echo '<span id="fus-segment-batch-msg" class="fus-inline-msg"></span>';
                echo '</div>';
            }
            echo '<div class="fus-batch-actions" style="margin-top:-2px;">';
            echo '<button type="button" id="fus-zoho-check-btn" class="fus-btn-secondary" onclick="fusCheckZohoForFiltered()">Check Zoho For Filtered Results</button>';
            echo '<button type="button" id="fus-zoho-stop-btn" class="fus-btn-secondary" onclick="fusStopZohoBulkCheck()" disabled>Stop</button>';
            echo '<select id="fus-zoho-filter" class="fus-apple-select" onchange="fusApplyZohoFilter(this.value)">';
            echo '<option value="all"' . ( $zoho_filter === 'all' ? ' selected' : '' ) . '>Zoho Filter: All</option>';
            echo '<option value="client"' . ( $zoho_filter === 'client' ? ' selected' : '' ) . '>Client only</option>';
            echo '<option value="lead"' . ( $zoho_filter === 'lead' ? ' selected' : '' ) . '>Lead only</option>';
            echo '<option value="not_found"' . ( $zoho_filter === 'not_found' ? ' selected' : '' ) . '>Not Found only</option>';
            echo '<option value="error"' . ( $zoho_filter === 'error' ? ' selected' : '' ) . '>Error only</option>';
            echo '<option value="pending"' . ( $zoho_filter === 'pending' ? ' selected' : '' ) . '>Pending only</option>';
            echo '</select>';
            echo '<span id="fus-zoho-summary" class="fus-inline-msg">Filter applies to full result set.</span>';
            echo '</div>';

            echo '<div class="fus-table-wrap"><table class="fus-table"><thead><tr>';
            $th_cols = array(
                array('label'=>'#','key'=>''),
                array('label'=>'Name','key'=>'display_name'),
                array('label'=>'Email','key'=>'user_email'),
                array('label'=>'Registered','key'=>'user_registered'),
                array('label'=>'Last Active','key'=>'last_activity'),
                array('label'=>'Logins','key'=>'login_count'),
                array('label'=>'Mobile','key'=>'mobile'),
                array('label'=>'State','key'=>'indstate'),
                array('label'=>'DRN','key'=>'drn'),
                array('label'=>'Zoho','key'=>''),
                array('label'=>'Graph','key'=>''),
            );
            if ( $show_batch_controls ) {
                array_splice($th_cols, 1, 0, array(array('label'=>'<input type="checkbox" id="fus-select-all-rows" onclick="fusToggleAllRows(this)">','key'=>'', 'raw'=>true)));
            }
            if (in_array($segment, array('registered', 'total'), true)) {
                $status_index = $show_batch_controls ? 10 : 9;
                array_splice($th_cols, $status_index, 0, array(array('label'=>'Status','key'=>'')));
            }
            foreach ($th_cols as $th) {
                if (!$th['key']) {
                    if ( ! empty( $th['raw'] ) ) {
                        echo '<th>' . $th['label'] . '</th>';
                    } else {
                        echo '<th>' . esc_html($th['label']) . '</th>';
                    }
                } else {
                    $sorted = ($orderby === $th['key']) ? ' sorted' : '';
                    echo '<th class="' . $sorted . '"><a href="' . esc_url(fus_sort_url($th['key'])) . '">' . esc_html($th['label']) . ' ' . fus_sort_arrow($th['key']) . '</a></th>';
                }
            }
            echo '</tr></thead><tbody>';

            if ($rows) {
                $n = (($paged-1) * $per_page) + 1;
                foreach ($rows as $r) {
                    $zoho_cached = fus_get_zoho_cached_status( (int) $r->ID );
                    $zoho_type = isset( $zoho_cached['type'] ) ? (string) $zoho_cached['type'] : 'pending';
                    $zoho_message = isset( $zoho_cached['message'] ) ? (string) $zoho_cached['message'] : '';
                    $zoho_label_map = array(
                        'client' => 'Client',
                        'lead' => 'Lead',
                        'not_found' => 'Not Found',
                        'error' => 'Error',
                    );
                    $zoho_label = isset( $zoho_label_map[ $zoho_type ] ) ? $zoho_label_map[ $zoho_type ] : '—';
                    $zoho_status_class = 'fus-status-unknown';
                    if ( $zoho_type === 'client' ) $zoho_status_class = 'fus-status-client';
                    if ( $zoho_type === 'lead' ) $zoho_status_class = 'fus-status-lead';
                    $zoho_title_attr = $zoho_message !== '' ? ' title="' . esc_attr( $zoho_message ) . '"' : '';
                    $zoho_html = ( $zoho_type === 'pending' )
                        ? '—'
                        : '<span class="fus-status ' . esc_attr( $zoho_status_class ) . '"' . $zoho_title_attr . '>' . esc_html( $zoho_label ) . '</span>';
                    $reg  = ($r->user_registered === '0000-00-00 00:00:00')
                        ? '<span class="fus-nil">Uploaded</span>'
                        : '<span class="fus-mono">' . esc_html(date('d M Y', strtotime($r->user_registered))) . '</span>';
                    $last = $r->last_activity
                        ? '<span class="fus-mono">' . esc_html(date('d M Y', strtotime($r->last_activity))) . '</span>'
                        : '<span class="fus-nil">&mdash;</span>';
                    echo '<tr>';
                    echo '<td style="color:#cbd5e1;font-size:11px;">' . $n++ . '</td>';
                    if ( $show_batch_controls ) {
                        echo '<td><input type="checkbox" class="fus-row-select" value="' . (int) $r->ID . '"></td>';
                    }
                    echo '<td><strong>' . esc_html($r->display_name) . '</strong></td>';
                    echo '<td class="fus-mono" style="color:#64748b;">' . esc_html($r->user_email) . '</td>';
                    echo '<td>' . $reg . '</td>';
                    echo '<td>' . $last . '</td>';
                    echo '<td style="font-weight:600;">' . intval($r->login_count) . '</td>';
                    echo '<td>' . ($r->mobile   ? esc_html($r->mobile)   : '<span class="fus-nil">&mdash;</span>') . '</td>';
                    echo '<td>' . ($r->indstate ? esc_html($r->indstate) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                    echo '<td class="fus-mono" style="color:#64748b;">' . ($r->drn ? esc_html($r->drn) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                    if (in_array($segment, array('registered', 'total'), true)) {
                        $status = ($r->approval_status === 'approved') ? 'approved' : 'pending';
                        $status_label = ($status === 'approved') ? 'Approved' : 'Pending';
                        echo '<td><span class="fus-status fus-status-' . esc_attr($status) . '">' . esc_html($status_label) . '</span></td>';
                    }
                    echo '<td><span id="fus-zoho-status-' . (int) $r->ID . '" class="fus-inline-msg fus-zoho-cell" data-zoho-status="' . esc_attr( $zoho_type ) . '">' . $zoho_html . '</span></td>';
                    echo '<td><button type="button" class="fus-btn-graph" onclick="fusOpenUserGraph(' . $r->ID . ',\'' . esc_js($r->display_name) . '\')" title="View activity graph">View</button></td>';
                    echo '</tr>';
                }
            } else {
                $colspan = in_array($segment, array('registered', 'total'), true) ? 12 : 11;
                if ( $show_batch_controls ) $colspan++;
                echo '<tr><td colspan="' . intval($colspan) . '" style="text-align:center;padding:40px;color:#94a3b8;">No users found.</td></tr>';
            }
            echo '</tbody></table></div>';

            // Pagination
            if ($total_pages > 1) {
                echo '<div class="fus-pagination">';
                if ($paged > 1) {
                    echo '<a href="' . esc_url(fus_build_url(array('paged'=>1))) . '">&laquo;</a>';
                    echo '<a href="' . esc_url(fus_build_url(array('paged'=>$paged-1))) . '">&lsaquo;</a>';
                }
                for ($p = max(1,$paged-2); $p <= min($total_pages,$paged+2); $p++) {
                    echo ($p === $paged) ? '<strong>' . $p . '</strong>' : '<a href="' . esc_url(fus_build_url(array('paged'=>$p))) . '">' . $p . '</a>';
                }
                if ($paged < $total_pages) {
                    echo '<a href="' . esc_url(fus_build_url(array('paged'=>$paged+1))) . '">&rsaquo;</a>';
                    echo '<a href="' . esc_url(fus_build_url(array('paged'=>$total_pages))) . '">&raquo;</a>';
                }
                echo '<span>Page ' . $paged . ' of ' . $total_pages . ' &nbsp;(' . number_format($total_rows) . ' total)</span>';
                echo '</div>';
            }
        } else {
            echo '<div style="background:#ffffffc9;border:1.5px dashed #d2d2d7;border-radius:14px;padding:40px;text-align:center;color:#86868b;">';
            echo '<p style="margin:0;font-size:14px;font-weight:500;">Click any card above to view the user list</p>';
            echo '</div>';
        }

    // ══════════════════════════════════════════
    // TAB: LOGIN TRENDS
    // ══════════════════════════════════════════
    } elseif ($active_tab === 'logins') {

        echo '<div class="fus-trend-wrap">';
        echo '<div class="fus-trend-header">';
        echo '<h2>Login Trends</h2>';
        echo '<div class="fus-trend-period-btns">';
        echo '<button class="fus-trend-period-btn active" id="btn-daily" onclick="fusLoadLoginTrend(\'daily\')">Daily (60 days)</button>';
        echo '<button class="fus-trend-period-btn" id="btn-monthly" onclick="fusLoadLoginTrend(\'monthly\')">Monthly</button>';
        echo '</div>';
        echo '</div>';

        echo '<div class="fus-trend-stats" id="fus-trend-stats">';
        echo '<div class="fus-trend-stat"><div class="fus-trend-stat-label">Unique Users Logged In</div><div class="fus-trend-stat-value purple" id="fus-stat-unique">&mdash;</div></div>';
        echo '<div class="fus-trend-stat"><div class="fus-trend-stat-label">Total Logins (All Time)</div><div class="fus-trend-stat-value green" id="fus-stat-total">&mdash;</div></div>';
        echo '<div class="fus-trend-stat"><div class="fus-trend-stat-label">Avg Logins / User</div><div class="fus-trend-stat-value" id="fus-stat-avg">&mdash;</div></div>';
        echo '</div>';

        echo '<div class="fus-trend-chart">';
        echo '<div class="fus-trend-chart-container"><canvas id="fusLoginCanvas"></canvas></div>';
        echo '<div class="fus-trend-drill">';
        echo '<div class="fus-trend-drill-head"><span id="fus-login-drill-title">Login Users</span><span id="fus-login-drill-count"></span></div>';
        echo '<div class="fus-trend-drill-body" id="fus-login-drill-body"><div class="fus-trend-drill-empty">Click a bar to view users for that period.</div></div>';
        echo '<div class="fus-trend-drill-pager" id="fus-login-drill-pager" style="display:none;"></div>';
        echo '</div>';
        echo '</div>';
        echo '</div>';

    // ══════════════════════════════════════════
    // TAB: STATE COUNCILS
    // ══════════════════════════════════════════
    } elseif ($active_tab === 'states') {
        $state_counts = fus_get_state_counts();
        $state_labels = array();
        $state_values = array();
        $state_total  = 0;
        foreach ($state_counts as $sc) {
            $state_labels[] = (string) $sc->state;
            $state_values[] = (int) $sc->cnt;
            $state_total   += (int) $sc->cnt;
        }
        $state_chart_payload = wp_json_encode(array('labels' => $state_labels, 'data' => $state_values));

        echo '<div class="fus-state-layout">';

        echo '<div class="fus-state-chart-panel">';
        echo '<div class="fus-state-panel-header">State Councils Distribution</div>';
        echo '<div class="fus-state-chart-wrap">';
        echo '<div class="fus-state-total">Total registered users with state: <strong>' . number_format($state_total) . '</strong></div>';
        echo '<div class="fus-state-chart-canvas-wrap"><canvas id="fusStateCanvas"></canvas></div>';
        echo '</div></div>';

        echo '<div class="fus-state-table-panel">';
        echo '<div class="fus-state-panel-header">State-wise Count</div>';
        echo '<div class="fus-table-wrap"><table class="fus-table"><thead><tr><th>#</th><th>State Council</th><th>Users</th></tr></thead><tbody>';
        if (!empty($state_counts)) {
            $n = 1;
            foreach ($state_counts as $sc) {
                echo '<tr>';
                echo '<td style="color:#cbd5e1;font-size:11px;">' . $n++ . '</td>';
                echo '<td><strong>' . esc_html($sc->state) . '</strong></td>';
                echo '<td style="font-weight:700;">' . number_format((int) $sc->cnt) . '</td>';
                echo '</tr>';
            }
        } else {
            echo '<tr><td colspan="3" style="text-align:center;padding:34px;color:#94a3b8;">No state council data found.</td></tr>';
        }
        echo '</tbody></table></div></div>';

        echo '</div>';

    // ══════════════════════════════════════════
    // TAB: COURSES (LEARNPRESS)
    // ══════════════════════════════════════════
    } elseif ($active_tab === 'courses') {
        if ( ! fus_lp_is_available() ) {
            echo '<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:30px 24px;">';
            echo '<h3 style="margin-top:0;color:#92400e;">LearnPress not detected</h3>';
            echo '<p style="color:#78350f;margin-bottom:0;">Course analytics are unavailable until LearnPress is active.</p>';
            echo '</div>';
        } else {
            echo '<form method="GET" action="' . esc_url(admin_url('admin.php')) . '">';
            echo '<input type="hidden" name="page" value="finnovate-user-stats">';
            echo '<input type="hidden" name="tab" value="courses">';
            if ($course_id) echo '<input type="hidden" name="course_id" value="' . esc_attr($course_id) . '">';
            echo '<div class="fus-filters">';
            echo '<label>Period</label>';
            echo '<select name="course_period" id="fus-course-period" onchange="fusCoursePeriodChange(this.value)">';
            $cpopts = array(''=>'All Time (Default)','today'=>'Today','yesterday'=>'Yesterday','last7'=>'Last 7 Days','last30'=>'Last 30 Days','thismonth'=>'This Month','lastmonth'=>'Last Month','custom'=>'Custom Range');
            foreach ($cpopts as $val => $lbl) {
                echo '<option value="' . esc_attr($val) . '"' . ($course_period === $val ? ' selected' : '') . '>' . esc_html($lbl) . '</option>';
            }
            echo '</select>';
            $course_custom_class = ($course_period === 'custom') ? ' visible' : '';
            echo '<span class="fus-custom-dates' . $course_custom_class . '" id="fus-course-custom">';
            echo '<label>From</label><input type="date" name="course_date_from" value="' . esc_attr($course_date_from) . '">';
            echo '<label>To</label><input type="date" name="course_date_to" value="' . esc_attr($course_date_to) . '">';
            echo '</span>';
            echo '<button type="submit" class="fus-btn">Apply</button>';
            if ($course_period || $course_date_from || $course_date_to || $course_id) {
                echo '<a href="' . esc_url(fus_build_url(array('tab'=>'courses','course_period'=>'','course_date_from'=>'','course_date_to'=>'','course_id'=>'','course_paged'=>1))) . '" class="fus-btn-secondary">Clear</a>';
            }
            echo '</div></form>';

            if ( $course_note ) {
                echo '<p style="font-size:12px;color:#6e6e73;margin:-8px 0 14px;padding:10px 14px;background:#ffffffc7;border-radius:12px;border:1px solid #d2d2d7;">&#x2139; ' . esc_html($course_note) . '</p>';
            }

            echo '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px;">';
            foreach (array(
                array('Total Courses', (int) $course_totals['courses'], '#0071e3'),
                array('Total Enrolled', (int) $course_totals['enrolled'], '#0ea5e9'),
                array('Total Started (Viewed)', (int) $course_totals['started'], '#f59e0b'),
                array('Total Completed', (int) $course_totals['completed'], '#10b981'),
            ) as $mini) {
                echo '<div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:16px 18px;">';
                echo '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:8px;">' . esc_html($mini[0]) . '</div>';
                echo '<div style="font-size:30px;font-weight:700;color:' . esc_attr($mini[2]) . ';letter-spacing:-0.5px;">' . number_format((int)$mini[1]) . '</div>';
                echo '</div>';
            }
            echo '</div>';
            echo '<p style="margin:-6px 0 14px;color:#6e6e73;font-size:12px;">Started = enrolled learners with progress above 0%. Avg Progress is computed across enrolled learners.</p>';

            echo '<h2 style="font-size:16px;font-weight:700;margin:4px 0 8px;letter-spacing:-0.3px;">Course Summary <span style="font-size:13px;color:#94a3b8;font-weight:400;">(' . number_format(count($course_rows)) . ' courses)</span></h2>';
            echo '<div class="fus-table-wrap"><table class="fus-table"><thead><tr>';
            echo '<th>#</th><th>Course</th><th>Enrolled</th><th>Started</th><th>Completed</th><th>Avg Progress</th><th>Action</th>';
            echo '</tr></thead><tbody>';
            if (!empty($course_rows)) {
                $n = 1;
                foreach ($course_rows as $cr) {
                    $selected_class = ($course_id === (int)$cr->course_id) ? ' style="background:#f8fbff;"' : '';
                    $view_url = fus_build_url(array('tab'=>'courses','course_id'=>(int)$cr->course_id,'course_paged'=>1));
                    echo '<tr' . $selected_class . '>';
                    echo '<td style="color:#cbd5e1;font-size:11px;">' . $n++ . '</td>';
                    echo '<td><strong>' . esc_html($cr->course_title) . '</strong></td>';
                    echo '<td style="font-weight:700;">' . number_format((int)$cr->enrolled_count) . '</td>';
                    echo '<td style="font-weight:700;">' . number_format((int)$cr->started_count) . '</td>';
                    echo '<td style="font-weight:700;">' . number_format((int)$cr->completed_count) . '</td>';
                    echo '<td class="fus-mono">' . esc_html(number_format((float)$cr->avg_progress, 1)) . '%</td>';
                    echo '<td><a href="' . esc_url($view_url) . '" class="fus-btn-secondary" style="padding:5px 10px;" onclick="return fusLoadCourseLearners(' . (int)$cr->course_id . ', 1);">View learners</a></td>';
                    echo '</tr>';
                }
            } else {
                echo '<tr><td colspan="7" style="text-align:center;padding:34px;color:#94a3b8;">No LearnPress course enrollments found for this period.</td></tr>';
            }
            echo '</tbody></table></div>';

            $selected_title = isset($course_selected['course_title']) && $course_selected['course_title'] ? $course_selected['course_title'] : '';
            echo '<div class="fus-trend-drill" style="margin-top:16px;">';
            echo '<div class="fus-trend-drill-head"><span id="fus-course-drill-title">' . ($course_id ? 'Learners: ' . esc_html($selected_title) : 'Course Learners') . '</span><span id="fus-course-drill-count">' . ($course_id ? number_format((int)$course_selected['total']) . ' learners' : '') . '</span></div>';
            echo '<div class="fus-trend-drill-body" id="fus-course-drill-body">';

            if ($course_id && !empty($course_selected['rows'])) {
                echo '<div class="fus-table-wrap"><table class="fus-table"><thead><tr>';
                echo '<th>#</th><th>User</th><th>Email</th><th>Status</th><th>Progress</th><th>Started At</th><th>Completed At</th><th>Last Activity</th>';
                echo '</tr></thead><tbody>';
                $row_num = (($course_paged - 1) * $course_per_page) + 1;
                foreach ($course_selected['rows'] as $lr) {
                    echo '<tr>';
                    echo '<td style="color:#cbd5e1;font-size:11px;">' . $row_num++ . '</td>';
                    echo '<td><strong>' . esc_html($lr->display_name) . '</strong></td>';
                    echo '<td class="fus-mono" style="color:#64748b;">' . ($lr->user_email ? esc_html($lr->user_email) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                    echo '<td><span class="fus-status ' . ($lr->status === 'completed' ? 'fus-status-approved' : ($lr->status === 'started' ? 'fus-status-pending' : '')) . '">' . esc_html(ucfirst($lr->status)) . '</span></td>';
                    echo '<td class="fus-mono">' . esc_html(number_format((float)$lr->progress, 1)) . '%</td>';
                    echo '<td class="fus-mono">' . ($lr->started_at ? esc_html(date('d M Y, g:i A', strtotime($lr->started_at))) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                    echo '<td class="fus-mono">' . ($lr->completed_at ? esc_html(date('d M Y, g:i A', strtotime($lr->completed_at))) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                    echo '<td class="fus-mono">' . ($lr->last_activity ? esc_html(date('d M Y, g:i A', strtotime($lr->last_activity))) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                    echo '</tr>';
                }
                echo '</tbody></table></div>';
            } elseif ($course_id) {
                echo '<div class="fus-trend-drill-empty">No learners found for this course in the selected period.</div>';
            } else {
                echo '<div class="fus-trend-drill-empty">Select a course to view learners.</div>';
            }

            echo '</div>';
            echo '<div class="fus-trend-drill-pager" id="fus-course-drill-pager"' . ($course_id && (int)$course_selected['total'] > 0 ? '' : ' style="display:none;"') . '>';
            if ($course_id && (int)$course_selected['total'] > 0) {
                echo '<span>Page ' . (int)$course_paged . ' of ' . (int)$course_total_pages . '</span>';
                echo '<button type="button"' . ($course_paged <= 1 ? ' disabled' : '') . ' onclick="fusLoadCourseLearners(' . (int)$course_id . ', ' . (int)($course_paged - 1) . ')">Prev</button>';
                echo '<button type="button"' . ($course_paged >= $course_total_pages ? ' disabled' : '') . ' onclick="fusLoadCourseLearners(' . (int)$course_id . ', ' . (int)($course_paged + 1) . ')">Next</button>';
            }
            echo '</div>';
            if ($course_id && !empty($course_selected['note'])) {
                echo '<div style="padding:10px 12px;border-top:1px solid #ececf0;font-size:12px;color:#6e6e73;">&#x2139; ' . esc_html($course_selected['note']) . '</div>';
            }
            echo '</div>';
        }

    // ══════════════════════════════════════════
    // TAB: LEADERBOARD
    // ══════════════════════════════════════════
    } elseif ($active_tab === 'leaderboard') {
        echo '<div class="fus-leaderboard-wrap">';

        echo '<form method="GET" action="' . esc_url(admin_url('admin.php')) . '">';
        echo '<input type="hidden" name="page" value="finnovate-user-stats">';
        echo '<input type="hidden" name="tab" value="leaderboard">';
        echo '<input type="hidden" name="include_internal" value="' . ( $include_internal ? '1' : '0' ) . '">';
        echo '<div class="fus-filters">';
        echo '<label>Period</label>';
        echo '<select name="lb_period" id="fus-lb-period" onchange="fusLbPeriodChange(this.value)">';
        $lb_popts = array(
            'all' => 'All Time (Default)',
            'today' => 'Today',
            'yesterday' => 'Yesterday',
            'last7' => 'Last 7 Days',
            'last30' => 'Last 30 Days',
            'thismonth' => 'This Month',
            'lastmonth' => 'Last Month',
            'custom' => 'Custom Range',
        );
        foreach ($lb_popts as $val => $lbl) {
            echo '<option value="' . esc_attr($val) . '"' . ($lb_period === $val ? ' selected' : '') . '>' . esc_html($lbl) . '</option>';
        }
        echo '</select>';
        $lb_custom_class = ($lb_period === 'custom') ? ' visible' : '';
        echo '<span class="fus-custom-dates' . $lb_custom_class . '" id="fus-lb-custom">';
        echo '<label>From</label><input type="date" name="lb_date_from" value="' . esc_attr($lb_date_from) . '">';
        echo '<label>To</label><input type="date" name="lb_date_to" value="' . esc_attr($lb_date_to) . '">';
        echo '</span>';
        echo '<button type="submit" class="fus-btn">Apply</button>';
        if ($lb_period !== 'all' || $lb_date_from || $lb_date_to) {
            echo '<a href="' . esc_url(fus_build_url(array('tab'=>'leaderboard','lb_period'=>'all','lb_date_from'=>'','lb_date_to'=>'','lb_paged'=>1))) . '" class="fus-btn-secondary">Clear</a>';
        }
        echo '<a href="' . esc_url($lb_csv_url) . '" class="fus-btn-csv">Export CSV</a>';
        echo '</div></form>';

        echo '<div class="fus-leaderboard-stats">';
        echo '<div class="fus-leaderboard-stat"><div class="fus-leaderboard-stat-label">Total Tracked Views</div><div class="fus-leaderboard-stat-value">' . number_format($lb_summary['total_views']) . '</div></div>';
        echo '<div class="fus-leaderboard-stat"><div class="fus-leaderboard-stat-label">Total Time Spent</div><div class="fus-leaderboard-stat-value">' . esc_html(fus_format_seconds($lb_summary['total_time_spent'])) . '</div></div>';
        echo '<div class="fus-leaderboard-stat"><div class="fus-leaderboard-stat-label">Unique Logged-in Users</div><div class="fus-leaderboard-stat-value">' . number_format($lb_summary['unique_users']) . '</div></div>';
        echo '</div>';

        echo '<h2 style="font-size:16px;font-weight:700;margin:4px 0 8px;letter-spacing:-0.3px;">Top Users by Engagement <span style="font-size:13px;color:#94a3b8;font-weight:400;">(' . number_format($lb_total_rows) . ' users)</span></h2>';
        echo '<div class="fus-table-wrap"><table class="fus-table"><thead><tr>';
        echo '<th>Rank</th><th>User</th><th>Email</th><th>Views</th><th>Total Time</th><th>Avg Time/View</th><th>Last Seen</th>';
        echo '</tr></thead><tbody>';

        if ($lb_rows) {
            $rank = (($lb_paged - 1) * $lb_per_page) + 1;
            foreach ($lb_rows as $r) {
                $rank_class = ($rank === 1) ? ' top1' : (($rank === 2) ? ' top2' : (($rank === 3) ? ' top3' : ''));
                echo '<tr>';
                echo '<td><span class="fus-rank-badge' . $rank_class . '">' . intval($rank++) . '</span></td>';
                echo '<td><strong>' . esc_html($r->display_name) . '</strong></td>';
                echo '<td class="fus-mono" style="color:#64748b;">' . ($r->user_email ? esc_html($r->user_email) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                echo '<td style="font-weight:700;">' . number_format((int)$r->total_views) . '</td>';
                echo '<td class="fus-mono">' . esc_html(fus_format_seconds((int)$r->total_time_spent)) . '</td>';
                echo '<td class="fus-mono">' . (is_null($r->avg_time_spent) ? '<span class="fus-nil">&mdash;</span>' : esc_html(number_format((float)$r->avg_time_spent, 1) . 's')) . '</td>';
                echo '<td class="fus-mono" style="color:#94a3b8;">' . ($r->last_viewed_at ? esc_html(date('d M Y, g:i A', strtotime($r->last_viewed_at))) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                echo '</tr>';
            }
        } else {
            echo '<tr><td colspan="7" style="text-align:center;padding:40px;color:#94a3b8;">No leaderboard activity found for selected period.</td></tr>';
        }
        echo '</tbody></table></div>';

        if ($lb_total_pages > 1) {
            echo '<div class="fus-pagination">';
            if ($lb_paged > 1) {
                echo '<a href="' . esc_url(fus_build_url(array('tab'=>'leaderboard','lb_paged'=>1))) . '">&laquo;</a>';
                echo '<a href="' . esc_url(fus_build_url(array('tab'=>'leaderboard','lb_paged'=>$lb_paged-1))) . '">&lsaquo;</a>';
            }
            for ($p = max(1,$lb_paged-2); $p <= min($lb_total_pages,$lb_paged+2); $p++) {
                echo ($p === $lb_paged) ? '<strong>' . $p . '</strong>' : '<a href="' . esc_url(fus_build_url(array('tab'=>'leaderboard','lb_paged'=>$p))) . '">' . $p . '</a>';
            }
            if ($lb_paged < $lb_total_pages) {
                echo '<a href="' . esc_url(fus_build_url(array('tab'=>'leaderboard','lb_paged'=>$lb_paged+1))) . '">&rsaquo;</a>';
                echo '<a href="' . esc_url(fus_build_url(array('tab'=>'leaderboard','lb_paged'=>$lb_total_pages))) . '">&raquo;</a>';
            }
            echo '<span>Page ' . $lb_paged . ' of ' . $lb_total_pages . ' &nbsp;(' . number_format($lb_total_rows) . ' total)</span>';
            echo '</div>';
        }

        echo '</div>';

    // TAB: POST ACTIVITY
    // ══════════════════════════════════════════
    } elseif ($active_tab === 'activity') {
        global $wpdb;
        $activity_table = $wpdb->prefix . 'fus_page_views';
        $table_exists = ($wpdb->get_var("SHOW TABLES LIKE '{$activity_table}'") === $activity_table);

        if (!$table_exists) {
            echo '<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:30px 24px;">';
            echo '<h3 style="margin-top:0;color:#92400e;">&#x26A0; Activity Tracking Not Yet Active</h3>';
            echo '<p style="color:#78350f;margin-bottom:0;">The tracking table is created automatically. Visit pages as a logged-in user to start capturing post-login activity.</p>';
            echo '</div>';
        } else {
            echo '<form method="GET" action="' . esc_url(admin_url('admin.php')) . '">';
            echo '<input type="hidden" name="page" value="finnovate-user-stats">';
            echo '<input type="hidden" name="tab" value="activity">';
            echo '<div class="fus-filters">';
            echo '<label>Period</label>';
            echo '<select name="activity_period" id="fus-activity-period" onchange="fusActivityPeriodChange(this.value)">';
            $activity_popts = array(''=>'All Time (Default)','today'=>'Today','yesterday'=>'Yesterday','last7'=>'Last 7 Days','last30'=>'Last 30 Days','thismonth'=>'This Month','lastmonth'=>'Last Month','custom'=>'Custom Range');
            foreach ($activity_popts as $val => $lbl) {
                echo '<option value="' . esc_attr($val) . '"' . ($activity_period === $val ? ' selected' : '') . '>' . esc_html($lbl) . '</option>';
            }
            echo '</select>';
            $activity_custom_class = ($activity_period === 'custom') ? ' visible' : '';
            echo '<span class="fus-custom-dates' . $activity_custom_class . '" id="fus-activity-custom">';
            echo '<label>From</label><input type="date" name="activity_date_from" value="' . esc_attr($activity_date_from) . '">';
            echo '<label>To</label><input type="date" name="activity_date_to" value="' . esc_attr($activity_date_to) . '">';
            echo '</span>';
            echo '<button type="submit" class="fus-btn">Apply</button>';
            if ($activity_period || $activity_date_from || $activity_date_to) {
                echo '<a href="' . esc_url(fus_build_url(array('tab'=>'activity','activity_period'=>'','activity_date_from'=>'','activity_date_to'=>''))) . '" class="fus-btn-secondary">Clear</a>';
            }
            echo '</div></form>';

            if ($activity_has_filter) {
                echo '<p style="font-size:12px;color:#6e6e73;margin:-8px 0 14px;padding:10px 14px;background:#ffffffc7;border-radius:12px;border:1px solid #d2d2d7;">';
                echo '&#x2139; Showing post-login activity from <strong>' . esc_html(date('d M Y', strtotime($activity_date_from_eff))) . '</strong> to <strong>' . esc_html(date('d M Y', strtotime($activity_date_to_eff))) . '</strong>.';
                echo '</p>';
            }

            echo '<div style="display:flex;flex-wrap:nowrap;gap:12px;margin-bottom:24px;">';
            foreach (array(
                array('Logged-in Views', (int) $activity_summary['total_views'], '#0071e3'),
                array('Unique Logged-in Users', (int) $activity_summary['unique_users'], '#10b981'),
                array('Avg Time/View (sec)', (float) $activity_summary['avg_time_view'], '#f59e0b'),
                array('Views per User', (float) $activity_summary['views_per_user'], '#2563eb'),
                array('Avg Time/User (sec)', (float) $activity_summary['avg_time_user'], '#0ea5e9'),
                array('Views Last 24h', (int) $activity_summary['views_last_24h'], '#f97316'),
            ) as $mini) {
                $value = is_float($mini[1]) ? number_format($mini[1], 1) : number_format((int) $mini[1]);
                echo '<div style="flex:1 1 0;min-width:0;background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:18px 20px;">';
                echo '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:8px;">' . esc_html($mini[0]) . '</div>';
                echo '<div style="font-size:28px;font-weight:700;color:' . esc_attr($mini[2]) . ';letter-spacing:-0.5px;">' . esc_html($value) . '</div>';
                echo '</div>';
            }
            echo '</div>';

            echo '<div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:20px;">';
            echo '<div style="padding:16px 20px;border-bottom:1.5px solid #f1f5f9;font-size:15px;font-weight:700;">Top Viewed Posts (Post-login)</div>';
            echo '<div class="fus-table-wrap"><table class="fus-table"><thead><tr>';
            echo '<th>#</th><th>Post Title</th><th>Total Views</th><th>Unique Users</th><th>Avg Time (sec)</th><th>Last Seen</th>';
            echo '</tr></thead><tbody>';
            if ($activity_top_posts) {
                $n = 1;
                foreach ($activity_top_posts as $tp) {
                    $post_link = $tp->post_id ? get_permalink($tp->post_id) : '#';
                    echo '<tr>';
                    echo '<td style="color:#cbd5e1;font-size:11px;">' . $n++ . '</td>';
                    echo '<td><a href="' . esc_url($post_link) . '" target="_blank" style="color:#0071e3;text-decoration:none;font-weight:500;">' . esc_html($tp->post_title) . '</a></td>';
                    echo '<td style="font-weight:600;">' . number_format((int) $tp->views) . '</td>';
                    echo '<td>' . number_format((int) $tp->unique_users) . '</td>';
                    echo '<td class="fus-mono">' . (is_null($tp->avg_time) ? '<span class="fus-nil">&mdash;</span>' : number_format((float)$tp->avg_time, 1) . 's') . '</td>';
                    echo '<td class="fus-mono" style="color:#94a3b8;">' . ($tp->last_seen ? esc_html(date('d M Y, g:i A', strtotime($tp->last_seen))) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                    echo '</tr>';
                }
            } else {
                echo '<tr><td colspan="6" style="text-align:center;padding:30px;color:#94a3b8;">No post-login views tracked yet.</td></tr>';
            }
            echo '</tbody></table></div></div>';

            echo '<div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;">';
            echo '<div style="padding:16px 20px;border-bottom:1.5px solid #f1f5f9;font-size:15px;font-weight:700;">Recent Logged-in Activity</div>';
            echo '<div class="fus-table-wrap"><table class="fus-table"><thead><tr>';
            echo '<th>User</th><th>Email</th><th>Post</th><th>Time Spent</th><th>When</th>';
            echo '</tr></thead><tbody>';
            if ($activity_recent) {
                foreach ($activity_recent as $ra) {
                    echo '<tr>';
                    echo '<td><strong>' . esc_html($ra->display_name ?: 'User #' . (int) $ra->user_id) . '</strong></td>';
                    echo '<td class="fus-mono" style="color:#64748b;">' . ($ra->user_email ? esc_html($ra->user_email) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                    echo '<td style="color:#64748b;">' . esc_html($ra->post_title) . '</td>';
                    echo '<td class="fus-mono">' . intval($ra->time_spent) . 's</td>';
                    echo '<td class="fus-mono" style="color:#94a3b8;">' . esc_html(date('d M Y, g:i A', strtotime($ra->viewed_at))) . '</td>';
                    echo '</tr>';
                }
            } else {
                echo '<tr><td colspan="5" style="text-align:center;padding:30px;color:#94a3b8;">No post-login activity yet.</td></tr>';
            }
            echo '</tbody></table></div></div>';
        }
    // TAB: PRE-LOGIN TRACKER
    // ══════════════════════════════════════════
    } elseif ($active_tab === 'prelogin') {
        $prelogin_summary = fus_get_prelogin_summary();
        $prelogin_referrers = fus_get_prelogin_top_referrers(20);
        $prelogin_top = fus_get_prelogin_top_pages(30);
        $prelogin_recent = fus_get_prelogin_recent_views(50);

        echo '<div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:20px;margin-bottom:24px;">';
        foreach (array(
            array('Anonymous Views', (int) $prelogin_summary['total_views'], '#2563eb'),
            array('Unique Public Pages', (int) $prelogin_summary['unique_pages'], '#0ea5e9'),
            array('Signup Page Views', (int) $prelogin_summary['signup_views'], '#f59e0b'),
            array('Login Page Views', (int) $prelogin_summary['login_views'], '#f97316'),
            array('Views Last 24h', (int) $prelogin_summary['views_last_24h'], '#10b981'),
            array('Avg Time (sec)', (int) $prelogin_summary['avg_time_spent'], '#7c3aed'),
        ) as $mini) {
            echo '<div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:18px 20px;">';
            echo '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:8px;">' . esc_html($mini[0]) . '</div>';
            echo '<div style="font-size:28px;font-weight:700;color:' . esc_attr($mini[2]) . ';letter-spacing:-0.5px;">' . number_format($mini[1]) . '</div>';
            echo '</div>';
        }
        echo '</div>';

        echo '<div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:20px;">';
        echo '<div style="padding:16px 20px;border-bottom:1.5px solid #f1f5f9;font-size:15px;font-weight:700;">Top Referrers (How Visitors Reached)</div>';
        echo '<div class="fus-table-wrap"><table class="fus-table"><thead><tr>';
        echo '<th>#</th><th>Referrer</th><th>Views</th><th>Landing Pages</th><th>Avg Time (sec)</th><th>Last Seen</th>';
        echo '</tr></thead><tbody>';
        if ($prelogin_referrers) {
            $n = 1;
            foreach ($prelogin_referrers as $row) {
                echo '<tr>';
                echo '<td style="color:#cbd5e1;font-size:11px;">' . $n++ . '</td>';
                echo '<td class="fus-mono" style="color:#334155;">' . esc_html( (string) $row->referrer ) . '</td>';
                echo '<td style="font-weight:600;">' . number_format((int)$row->views) . '</td>';
                echo '<td>' . number_format((int)$row->landing_pages) . '</td>';
                echo '<td class="fus-mono">' . (is_null($row->avg_time) ? '<span class="fus-nil">&mdash;</span>' : number_format((float)$row->avg_time, 1) . 's') . '</td>';
                echo '<td class="fus-mono" style="color:#94a3b8;">' . ($row->last_seen ? esc_html(date('d M Y, g:i A', strtotime($row->last_seen))) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                echo '</tr>';
            }
        } else {
            echo '<tr><td colspan="6" style="text-align:center;padding:30px;color:#94a3b8;">No referrer data tracked yet.</td></tr>';
        }
        echo '</tbody></table></div></div>';

        echo '<div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:20px;">';
        echo '<div style="padding:16px 20px;border-bottom:1.5px solid #f1f5f9;font-size:15px;font-weight:700;">Top Public Pages (Anonymous)</div>';
        echo '<div class="fus-table-wrap"><table class="fus-table"><thead><tr>';
        echo '<th>#</th><th>Page</th><th>Views</th><th>Avg Time (sec)</th><th>Last Seen</th>';
        echo '</tr></thead><tbody>';
        if ($prelogin_top) {
            $n = 1;
            foreach ($prelogin_top as $row) {
                echo '<tr>';
                echo '<td style="color:#cbd5e1;font-size:11px;">' . $n++ . '</td>';
                echo '<td>';
                echo '<div style="font-weight:600;color:#1d1d1f;">' . esc_html( (string) $row->page_title ) . '</div>';
                echo '<div class="fus-mono" style="color:#64748b;font-size:11px;">' . esc_html( (string) $row->page_path ) . '</div>';
                echo '</td>';
                echo '<td style="font-weight:600;">' . number_format((int)$row->views) . '</td>';
                echo '<td class="fus-mono">' . (is_null($row->avg_time) ? '<span class="fus-nil">&mdash;</span>' : number_format((float)$row->avg_time, 1) . 's') . '</td>';
                echo '<td class="fus-mono" style="color:#94a3b8;">' . ($row->last_seen ? esc_html(date('d M Y, g:i A', strtotime($row->last_seen))) : '<span class="fus-nil">&mdash;</span>') . '</td>';
                echo '</tr>';
            }
        } else {
            echo '<tr><td colspan="5" style="text-align:center;padding:30px;color:#94a3b8;">No anonymous page views tracked yet.</td></tr>';
        }
        echo '</tbody></table></div></div>';

        echo '<div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;">';
        echo '<div style="padding:16px 20px;border-bottom:1.5px solid #f1f5f9;font-size:15px;font-weight:700;">Recent Anonymous Views</div>';
        echo '<div class="fus-table-wrap"><table class="fus-table"><thead><tr>';
        echo '<th>Page</th><th>Time Spent</th><th>When</th>';
        echo '</tr></thead><tbody>';
        if ($prelogin_recent) {
            foreach ($prelogin_recent as $row) {
                echo '<tr>';
                echo '<td>';
                echo '<div style="font-weight:600;color:#1d1d1f;">' . esc_html( (string) $row->page_title ) . '</div>';
                echo '<div class="fus-mono" style="color:#64748b;font-size:11px;">' . esc_html( (string) $row->page_path ) . '</div>';
                echo '</td>';
                echo '<td class="fus-mono">' . intval($row->time_spent) . 's</td>';
                echo '<td class="fus-mono" style="color:#94a3b8;">' . esc_html(date('d M Y, g:i A', strtotime($row->viewed_at))) . '</td>';
                echo '</tr>';
            }
        } else {
            echo '<tr><td colspan="3" style="text-align:center;padding:30px;color:#94a3b8;">No anonymous activity yet.</td></tr>';
        }
        echo '</tbody></table></div></div>';
    }

    echo '<p style="margin-top:28px;font-size:11px;color:#cbd5e1;">Finnovate User Stats v4.0 &nbsp;&bull;&nbsp; Login count tracks from plugin activation. Post activity tracks from first page load.</p>';
    echo '</div>'; // #fus-wrap

    // ── GRAPH MODAL ──
    echo '
<div id="fusGraphModal" class="fus-modal" onclick="if(event.target===this)fusCloseModal()">
  <div class="fus-modal-content">
    <div class="fus-modal-header">
      <h2 id="fusGraphTitle">Graph</h2>
      <button class="fus-modal-close" onclick="fusCloseModal()">&#x2715;</button>
    </div>
    <div class="fus-modal-body">
      <div class="fus-chart-meta" id="fusGraphMeta"></div>
      <div class="fus-chart-container"><canvas id="fusCanvas"></canvas></div>
    </div>
  </div>
</div>
<div id="fusZohoRawModal" class="fus-modal" onclick="if(event.target===this)fusCloseZohoRawModal()">
  <div class="fus-modal-content" style="width:min(980px,92vw);">
    <div class="fus-modal-header">
      <h2 id="fusZohoRawTitle">Zoho Raw Data</h2>
      <div style="display:flex;align-items:center;gap:8px;">
        <button type="button" class="fus-btn-secondary" style="padding:6px 12px;" onclick="fusCopyZohoRawJson()">Copy JSON</button>
        <span id="fusZohoRawCopyMsg" class="fus-inline-msg" style="font-size:12px;color:#16a34a;"></span>
        <button class="fus-modal-close" onclick="fusCloseZohoRawModal()">&#x2715;</button>
      </div>
    </div>
    <div class="fus-modal-body">
      <pre id="fusZohoRawPre" class="fus-mono" style="white-space:pre-wrap;word-break:break-word;max-height:68vh;overflow:auto;background:#0f172a;color:#e2e8f0;padding:14px;border-radius:12px;border:1px solid #1e293b;"></pre>
    </div>
  </div>
</div>';

    // ── JAVASCRIPT ──
    echo '<script>
var fusChart = null;
var fusLoginChart = null;
var fusStateChart = null;
var fusLoginSelected = null;
var fusLoginTableState = { paged: 1, perPage: 20, orderby: "period_logins", order: "DESC" };
var fusCourseState = { courseId: ' . (int) $course_id . ', paged: ' . (int) $course_paged . ', perPage: ' . (int) $course_per_page . ' };
var fusZohoBulkRunning = false;
var fusZohoBulkCancelRequested = false;
var fusNonces = {
    segment: ' . json_encode( $segment_update_nonce ) . ',
    loginTrendUsers: ' . json_encode( $login_trend_nonce ) . ',
    courseLearners: ' . json_encode( $course_learners_nonce ) . ',
    zohoLookup: ' . json_encode( $zoho_lookup_nonce ) . ',
    zohoBulk: ' . json_encode( $zoho_bulk_nonce ) . ',
    zohoRaw: ' . json_encode( $zoho_raw_nonce ) . '
};

function fusPeriodChange(v){
    var el=document.getElementById("fus-custom-dates");
    el.classList.toggle("visible", v==="custom");
}

function fusLbPeriodChange(v){
    var el=document.getElementById("fus-lb-custom");
    if(!el) return;
    el.classList.toggle("visible", v==="custom");
}

function fusCoursePeriodChange(v){
    var el=document.getElementById("fus-course-custom");
    if(!el) return;
    el.classList.toggle("visible", v==="custom");
}

function fusActivityPeriodChange(v){
    var el=document.getElementById("fus-activity-custom");
    if(!el) return;
    el.classList.toggle("visible", v==="custom");
}

function fusGperiodChange(v){
    var el=document.getElementById("fus-gcustom");
    el.style.display = (v==="custom") ? "flex" : "none";
    if(v !== "custom") {
        document.getElementById("fus-global-filter-form").submit();
    }
}

function fusCloseModal(){
    document.getElementById("fusGraphModal").style.display="none";
}

function fusOpenChart(title, labels, data, color, metaHtml, showValueLabels) {
    document.getElementById("fusGraphTitle").innerText = title;
    document.getElementById("fusGraphMeta").innerHTML = metaHtml || "";
    document.getElementById("fusGraphModal").style.display = "block";
    var ctx = document.getElementById("fusCanvas").getContext("2d");
    if(fusChart) fusChart.destroy();
    fusChart = new Chart(ctx, {
        plugins: showValueLabels ? [{
            id: "lineValueLabels",
            afterDatasetsDraw: function(chart) {
                var c = chart.ctx;
                var meta = chart.getDatasetMeta(0);
                var vals = (chart.data.datasets[0] && chart.data.datasets[0].data) ? chart.data.datasets[0].data : [];
                var area = chart.chartArea || { top: 0, bottom: 0 };
                c.save();
                c.font = "600 11px Inter";
                c.fillStyle = "#1d1d1f";
                c.textAlign = "center";
                meta.data.forEach(function(pt, i) {
                    var raw = Number(vals[i] || 0);
                    var p = pt.getProps(["x","y"], true);
                    var y = p.y - 8;
                    var baseline = "bottom";
                    // If label would clip at the top, draw it below the point.
                    if (y <= area.top + 10) {
                        y = p.y + 10;
                        baseline = "top";
                    }
                    c.textBaseline = baseline;
                    c.fillText(raw.toLocaleString(), p.x, y);
                });
                c.restore();
            }
        }] : [],
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: title,
                data: data,
                backgroundColor: color.replace("1)", "0.08)"),
                borderColor: color,
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointRadius: labels.length > 30 ? 2 : 4,
                pointHoverRadius: 6,
                pointBackgroundColor: color,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#0f172a",
                    padding: 10,
                    titleFont: { family: "Inter", size: 12 },
                    bodyFont:  { family: "Inter", size: 13 },
                    callbacks: {
                        label: function(ctx) { return " " + ctx.parsed.y.toLocaleString(); }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { family: "Inter", size: 11 }, color: "#8e8e93" } },
                y: { beginAtZero: true, ticks: { precision: 0, font: { family: "Inter", size: 11 }, color: "#8e8e93" }, grid: { color: "#ececf0" } }
            }
        }
    });
}

function fusOpenMoM() {
    fetch(' . json_encode(admin_url('admin-ajax.php?action=fus_get_mom_growth')) . ')
        .then(function(r){return r.json();})
        .then(function(res){
            if(res.success) {
                var d = res.data;
                var peak = Math.max.apply(null, d.data);
                var peakIdx = d.data.indexOf(peak);
                var metaHtml =
                    \'<div class="fus-chart-meta-item"><div class="fus-chart-meta-label">Total Registered</div><div class="fus-chart-meta-value">\' + d.total.toLocaleString() + \'</div></div>\' +
                    \'<div class="fus-chart-meta-item"><div class="fus-chart-meta-label">Best Month</div><div class="fus-chart-meta-value">\' + d.labels[peakIdx] + \'</div></div>\' +
                    \'<div class="fus-chart-meta-item"><div class="fus-chart-meta-label">Peak Signups</div><div class="fus-chart-meta-value">\' + peak.toLocaleString() + \'</div></div>\';
                fusOpenChart("Month-on-Month: Registered User Growth", d.labels, d.data, "rgba(0,113,227,1)", metaHtml, true);
            }
        });
}

function fusRefreshCards() {
    if (!document.getElementById("fus-wrap")) return;
    var params = new URLSearchParams(window.location.search || "");
    var url = ' . json_encode(admin_url('admin-ajax.php?action=fus_get_card_stats')) . ';
    var query = [];
    ["gperiod", "gdate_from", "gdate_to", "include_internal"].forEach(function(k){
        var v = params.get(k);
        if (v) query.push(k + "=" + encodeURIComponent(v));
    });
    if (query.length) url += "&" + query.join("&");
    fetch(url)
        .then(function(r){ return r.json(); })
        .then(function(res){
            if (!res || !res.success || !res.data || !res.data.counts) return;
            var counts = res.data.counts;
            var delta = res.data.delta || {};
            Object.keys(counts).forEach(function(key){
                var card = document.querySelector(".fus-card.fus-" + key);
                if (!card) return;
                var num = card.querySelector(".fus-number");
                if (num) num.innerText = Number(counts[key] || 0).toLocaleString();
                var d = card.querySelector(".fus-delta strong");
                if (d) {
                    var dv = Number(delta[key] || 0);
                    d.innerText = "+" + dv.toLocaleString();
                    d.classList.toggle("zero", dv <= 0);
                }
            });
        });
}

function fusToggleIncludeInternal(checked) {
    var currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("include_internal", checked ? "1" : "0");
    currentUrl.searchParams.set("paged", "1");
    currentUrl.searchParams.set("lb_paged", "1");
    window.location = currentUrl.toString();
}

function fusToggleAllRows(el) {
    var checked = !!(el && el.checked);
    document.querySelectorAll(".fus-row-select").forEach(function(cb){ cb.checked = checked; });
}

function fusCloseZohoRawModal(){
    var m = document.getElementById("fusZohoRawModal");
    if (m) m.style.display = "none";
}

function fusCopyZohoRawJson(){
    var pre = document.getElementById("fusZohoRawPre");
    var msg = document.getElementById("fusZohoRawCopyMsg");
    if (!pre) return;
    var txt = pre.textContent || "";
    if (!txt) return;
    var onOk = function(){
        if (msg) {
            msg.innerText = "Copied";
            setTimeout(function(){ msg.innerText = ""; }, 1400);
        }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(onOk).catch(function(){});
        return;
    }
    var ta = document.createElement("textarea");
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); onOk(); } catch(e) {}
    document.body.removeChild(ta);
}

function fusFetchZohoRawForSelected(){
    var selected = document.querySelector(".fus-zoho-selected-user:checked");
    if (!selected) {
        alert("Select one user first.");
        return;
    }
    var userId = parseInt(selected.value || "0", 10);
    if (!userId) {
        alert("Invalid user selection.");
        return;
    }
    var pre = document.getElementById("fusZohoRawPre");
    var modal = document.getElementById("fusZohoRawModal");
    var title = document.getElementById("fusZohoRawTitle");
    if (!pre || !modal || !title) return;
    title.innerText = "Zoho Raw Data (User #" + String(userId) + ")";
    pre.textContent = "Fetching...";
    modal.style.display = "block";

    var url = ' . json_encode(admin_url('admin-ajax.php?action=fus_get_zoho_raw_user')) . '
        + "&nonce=" + encodeURIComponent(fusNonces.zohoRaw)
        + "&user_id=" + encodeURIComponent(String(userId));

    fetch(url)
        .then(function(r){ return r.json(); })
        .then(function(res){
            if (!res) {
                pre.textContent = "Empty response";
                return;
            }
            pre.textContent = JSON.stringify(res, null, 2);
        })
        .catch(function(err){
            pre.textContent = "Fetch failed: " + (err && err.message ? err.message : "Unknown error");
        });
}

function fusInitZohoTableSort(){
    var table = document.getElementById("fus-zoho-table");
    if (!table) return;
    var tbody = table.querySelector("tbody");
    if (!tbody) return;
    var sortButtons = table.querySelectorAll(".fus-zoho-sort-btn");
    if (!sortButtons.length) return;
    sortButtons.forEach(function(btn){
        btn.addEventListener("click", function(){
            var col = parseInt(btn.getAttribute("data-col") || "0", 10);
            if (!col) return;
            var nextDir = (btn.getAttribute("data-dir") === "asc") ? "desc" : "asc";
            sortButtons.forEach(function(b){
                if (b !== btn) {
                    b.setAttribute("data-dir", "");
                    b.classList.remove("active");
                    var a = b.querySelector(".fus-zoho-sort-arrow");
                    if (a) a.textContent = "↕";
                }
            });
            btn.setAttribute("data-dir", nextDir);
            btn.classList.add("active");
            var arrow = btn.querySelector(".fus-zoho-sort-arrow");
            if (arrow) arrow.textContent = nextDir === "asc" ? "↑" : "↓";

            var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
            rows.sort(function(r1, r2){
                var c1 = r1.children[col];
                var c2 = r2.children[col];
                var t1 = c1 ? String(c1.textContent || "").trim().toLowerCase() : "";
                var t2 = c2 ? String(c2.textContent || "").trim().toLowerCase() : "";
                var cmp = t1.localeCompare(t2, undefined, { numeric: true, sensitivity: "base" });
                return nextDir === "asc" ? cmp : -cmp;
            });
            rows.forEach(function(r){ tbody.appendChild(r); });
        });
    });
}

function fusRenderZohoStatusBadge(status, label, titleText) {
    var cls = "pending";
    if (["client","lead","not_found","error"].indexOf(status) >= 0) cls = status;
    var titleAttr = titleText ? (" title=\\"" + fusEscHtml(titleText) + "\\"") : "";
    return "<span class=\\"fus-status fus-status-" + (cls === "not_found" ? "unknown" : cls) + "\\"" + titleAttr + ">" + fusEscHtml(label) + "</span>";
}

function fusSetZohoStatus(userId, status, label, message) {
    var el = document.getElementById("fus-zoho-status-" + String(userId));
    if (!el) return;
    el.setAttribute("data-zoho-status", status || "pending");
    el.innerHTML = fusRenderZohoStatusBadge(status || "pending", label || "Pending", message || "");
    fusUpdateZohoSummary();
    var filterEl = document.getElementById("fus-zoho-filter");
    if (filterEl) fusApplyZohoFilterToRows(filterEl.value || "all");
}

function fusUpdateZohoSummary() {
    if (fusZohoBulkRunning) return;
    var summaryEl = document.getElementById("fus-zoho-summary");
    if (!summaryEl) return;
    summaryEl.innerText = "Filter applies to full result set.";
}

function fusApplyZohoFilter(filterVal) {
    var val = String(filterVal || "all");
    var currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("zoho_filter", val);
    currentUrl.searchParams.set("paged", "1");
    window.location = currentUrl.toString();
}

function fusApplyZohoFilterToRows(filterVal) {
    var val = String(filterVal || "all");
    document.querySelectorAll(".fus-zoho-cell").forEach(function(cell){
        var row = cell.closest("tr");
        if (!row) return;
        var st = String(cell.getAttribute("data-zoho-status") || "pending");
        row.style.display = (val === "all" || st === val) ? "" : "none";
    });
}

function fusApplySegmentBatch(sourceSegment) {
    var msg = document.getElementById("fus-segment-batch-msg");
    var target = document.getElementById("fus-segment-batch-target");
    if (!target || !target.value) {
        if (msg) msg.innerText = "Choose an action first.";
        return;
    }
    var selected = [];
    document.querySelectorAll(".fus-row-select:checked").forEach(function(cb){
        selected.push(parseInt(cb.value, 10));
    });
    if (!selected.length) {
        if (msg) msg.innerText = "Select at least one user.";
        return;
    }
    if (msg) msg.innerText = "Updating...";

    var payload = new URLSearchParams();
    payload.set("action", "fus_update_user_segments");
    payload.set("nonce", fusNonces.segment);
    payload.set("source_segment", sourceSegment);
    payload.set("target_segment", target.value);
    selected.forEach(function(id){ payload.append("user_ids[]", String(id)); });

    fetch(' . json_encode(admin_url('admin-ajax.php')) . ', {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: payload.toString()
    })
    .then(function(r){ return r.json(); })
    .then(function(res){
        if (!res || !res.success) {
            if (msg) msg.innerText = (res && res.data && res.data.message) ? res.data.message : "Update failed.";
            return;
        }
        window.location.reload();
    })
    .catch(function(){
        if (msg) msg.innerText = "Request failed.";
    });
}

function fusCheckZohoMember(userId) {
    userId = parseInt(userId || 0, 10);
    if (!userId) return;
    fusSetZohoStatus(userId, "pending", "Checking...", "");

    var url = ' . json_encode(admin_url('admin-ajax.php?action=fus_get_zoho_member_type')) . '
        + "&nonce=" + encodeURIComponent(fusNonces.zohoLookup)
        + "&user_id=" + encodeURIComponent(String(userId));

    fetch(url)
        .then(function(r){ return r.json(); })
        .then(function(res){
            if (!res || !res.success || !res.data) {
                var failMsg = (res && res.data && res.data.message) ? String(res.data.message) : "Zoho lookup failed";
                fusSetZohoStatus(userId, "error", "Error", failMsg);
                return;
            }
            var type = String(res.data.type || "");
            if (type === "client") {
                fusSetZohoStatus(userId, "client", "Client", "");
            } else if (type === "lead") {
                fusSetZohoStatus(userId, "lead", "Lead", "");
            } else if (type === "not_found") {
                fusSetZohoStatus(userId, "not_found", "Not Found", "");
            } else {
                var unknownMsg = res.data && res.data.message ? String(res.data.message) : "Unknown Zoho response";
                fusSetZohoStatus(userId, "error", "Unknown", unknownMsg);
            }
        })
        .catch(function(){
            fusSetZohoStatus(userId, "error", "Error", "Network/JSON error");
        });
}

function fusApplyZohoBulkResult(item) {
    if (!item || !item.user_id) return;
    var type = String(item.type || "error");
    var message = item.message ? String(item.message) : "";
    if (type === "client") {
        fusSetZohoStatus(item.user_id, "client", "Client", message);
    } else if (type === "lead") {
        fusSetZohoStatus(item.user_id, "lead", "Lead", message);
    } else if (type === "not_found") {
        fusSetZohoStatus(item.user_id, "not_found", "Not Found", message);
    } else {
        fusSetZohoStatus(item.user_id, "error", "Error", message || "Zoho lookup failed");
    }
}

function fusSetZohoBulkUi(running) {
    var checkBtn = document.getElementById("fus-zoho-check-btn");
    var stopBtn = document.getElementById("fus-zoho-stop-btn");
    if (checkBtn) checkBtn.disabled = !!running;
    if (stopBtn) stopBtn.disabled = !running;
}

function fusStopZohoBulkCheck() {
    if (!fusZohoBulkRunning) return;
    fusZohoBulkCancelRequested = true;
    var summaryEl = document.getElementById("fus-zoho-summary");
    if (summaryEl) summaryEl.innerText = "Stopping after current batch...";
}

function fusCheckZohoForFiltered() {
    if (fusZohoBulkRunning) return;
    var summaryEl = document.getElementById("fus-zoho-summary");
    var params = new URLSearchParams(window.location.search || "");
    var segment = params.get("segment") || "total";
    var dateFrom = params.get("date_from") || "";
    var dateTo = params.get("date_to") || "";
    var search = params.get("search") || "";
    var zohoFilter = params.get("zoho_filter") || "all";

    fusZohoBulkRunning = true;
    fusZohoBulkCancelRequested = false;
    fusSetZohoBulkUi(true);
    if (summaryEl) summaryEl.innerText = "Preparing filtered users...";

    var listUrl = ' . json_encode(admin_url('admin-ajax.php?action=fus_get_filtered_user_ids')) . '
        + "&nonce=" + encodeURIComponent(fusNonces.zohoBulk)
        + "&segment=" + encodeURIComponent(segment)
        + "&date_from=" + encodeURIComponent(dateFrom)
        + "&date_to=" + encodeURIComponent(dateTo)
        + "&search=" + encodeURIComponent(search)
        + "&zoho_filter=" + encodeURIComponent(zohoFilter);

    fetch(listUrl)
        .then(function(r){ return r.json(); })
        .then(function(res){
            if (!res || !res.success || !res.data || !Array.isArray(res.data.ids)) {
                throw new Error((res && res.data && res.data.message) ? String(res.data.message) : "Could not load filtered users.");
            }
            var ids = res.data.ids.map(function(v){ return parseInt(v, 10); }).filter(function(v){ return !!v; });
            if (!ids.length) {
                if (summaryEl) summaryEl.innerText = "No users in current filter.";
                return;
            }

            var batchSize = 8;
            var done = 0;
            if (summaryEl) summaryEl.innerText = "Checking 0 of " + ids.length.toLocaleString() + "...";

            return new Promise(function(resolve, reject){
                function runBatch(start) {
                    if (fusZohoBulkCancelRequested) {
                        resolve({ total: ids.length, done: done, stopped: true });
                        return;
                    }
                    var chunk = ids.slice(start, start + batchSize);
                    if (!chunk.length) {
                        resolve({ total: ids.length, done: done });
                        return;
                    }

                    var payload = new URLSearchParams();
                    payload.set("action", "fus_check_zoho_bulk");
                    payload.set("nonce", fusNonces.zohoBulk);
                    chunk.forEach(function(id){ payload.append("user_ids[]", String(id)); });

                    fetch(' . json_encode(admin_url('admin-ajax.php')) . ', {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
                        body: payload.toString()
                    })
                    .then(function(r){ return r.json(); })
                    .then(function(batchRes){
                        if (!batchRes || !batchRes.success || !batchRes.data) {
                            throw new Error((batchRes && batchRes.data && batchRes.data.message) ? String(batchRes.data.message) : "Zoho batch failed.");
                        }
                        var results = Array.isArray(batchRes.data.results) ? batchRes.data.results : [];
                        results.forEach(fusApplyZohoBulkResult);

                        done += chunk.length;
                        if (summaryEl) summaryEl.innerText = "Checking " + done.toLocaleString() + " of " + ids.length.toLocaleString() + "...";
                        if (fusZohoBulkCancelRequested) {
                            resolve({ total: ids.length, done: done, stopped: true });
                            return;
                        }
                        setTimeout(function(){ runBatch(start + batchSize); }, 140);
                    })
                    .catch(reject);
                }
                runBatch(0);
            });
        })
        .then(function(finalState){
            if (!finalState) return;
            if (summaryEl) {
                if (finalState.stopped) {
                    summaryEl.innerText = "Zoho check stopped. Processed " + Number(finalState.done || 0).toLocaleString() + " of " + Number(finalState.total || 0).toLocaleString() + ".";
                } else {
                    summaryEl.innerText = "Zoho check completed for " + Number(finalState.done || 0).toLocaleString() + " users in current filter.";
                }
            }
        })
        .catch(function(err){
            if (summaryEl) summaryEl.innerText = err && err.message ? err.message : "Zoho check failed.";
        })
        .finally(function(){
            fusZohoBulkRunning = false;
            fusZohoBulkCancelRequested = false;
            fusSetZohoBulkUi(false);
        });
}

document.addEventListener("DOMContentLoaded", function(){
    fusUpdateZohoSummary();
    var filterEl = document.getElementById("fus-zoho-filter");
    if (filterEl) fusApplyZohoFilterToRows(filterEl.value || "all");
    fusInitZohoTableSort();
});

function fusLoginSort(col) {
    if (!fusLoginSelected) return;
    if (fusLoginTableState.orderby === col) {
        fusLoginTableState.order = (fusLoginTableState.order === "ASC") ? "DESC" : "ASC";
    } else {
        fusLoginTableState.orderby = col;
        fusLoginTableState.order = "DESC";
    }
    fusLoadLoginDrilldown(1);
}

function fusEscHtml(v) {
    var s = String(v || "");
    s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    return s.replace(/\u0027/g, "&#39;");
}

function fusLoadLoginDrilldown(page) {
    if (!fusLoginSelected) return;
    var body = document.getElementById("fus-login-drill-body");
    var pager = document.getElementById("fus-login-drill-pager");
    var title = document.getElementById("fus-login-drill-title");
    var count = document.getElementById("fus-login-drill-count");
    if (!body) return;

    fusLoginTableState.paged = Math.max(1, page || 1);
    body.innerHTML = \'<div class="fus-trend-drill-empty">Loading users...</div>\';
    if (pager) pager.style.display = "none";

    var params = new URLSearchParams(window.location.search || "");
    var includeInternal = params.get("include_internal");
    var url = ' . json_encode(admin_url('admin-ajax.php?action=fus_get_login_trend_users')) . '
        + "&nonce=" + encodeURIComponent(fusNonces.loginTrendUsers)
        + "&range=" + encodeURIComponent(fusLoginSelected.range)
        + "&period_key=" + encodeURIComponent(fusLoginSelected.periodKey)
        + "&paged=" + encodeURIComponent(String(fusLoginTableState.paged))
        + "&per_page=" + encodeURIComponent(String(fusLoginTableState.perPage))
        + "&orderby=" + encodeURIComponent(fusLoginTableState.orderby)
        + "&order=" + encodeURIComponent(fusLoginTableState.order);
    if (includeInternal === "0") {
        url += "&include_internal=0";
    }

    fetch(url)
        .then(function(r){ return r.json(); })
        .then(function(res){
            if (!res || !res.success || !res.data) {
                body.innerHTML = \'<div class="fus-trend-drill-empty">Could not load users for this period.</div>\';
                return;
            }
            var d = res.data;
            var rows = Array.isArray(d.rows) ? d.rows : [];
            if (title) title.innerText = "Login Users: " + (d.period_label || fusLoginSelected.periodLabel || "");
            if (count) count.innerText = Number(d.total || 0).toLocaleString() + " users";

            if (!rows.length) {
                body.innerHTML = \'<div class="fus-trend-drill-empty">No users found for this period.</div>\';
                return;
            }

            var cols = [
                { key: "display_name", label: "Name" },
                { key: "user_email", label: "Email" },
                { key: "user_registered", label: "Registered" },
                { key: "last_activity", label: "Last Active" },
                { key: "period_logins", label: "Period Logins" },
                { key: "total_logins", label: "Total Logins" },
                { key: "mobile", label: "Mobile" },
                { key: "indstate", label: "State" },
                { key: "drn", label: "DRN" }
            ];
            var thead = "<thead><tr><th>#</th>";
            cols.forEach(function(c){
                var arrow = "";
                if (fusLoginTableState.orderby === c.key) arrow = fusLoginTableState.order === "ASC" ? " ↑" : " ↓";
                thead += \'<th><button type="button" class="fus-btn-graph" onclick="fusLoginSort(\\\'\' + c.key + \'\\\')">\' + c.label + arrow + "</button></th>";
            });
            thead += "</tr></thead>";

            var offset = (Number(d.paged || 1) - 1) * Number(d.per_page || fusLoginTableState.perPage);
            var tbody = "<tbody>";
            rows.forEach(function(r, idx){
                var reg = (r.user_registered && r.user_registered !== "0000-00-00 00:00:00") ? r.user_registered.slice(0, 10) : "Uploaded";
                var last = r.last_activity ? r.last_activity.slice(0, 10) : "—";
                tbody += "<tr>";
                tbody += "<td>" + String(offset + idx + 1) + "</td>";
                tbody += "<td><strong>" + fusEscHtml(r.display_name || "") + "</strong></td>";
                tbody += "<td class=\\"fus-mono\\">" + fusEscHtml(r.user_email || "") + "</td>";
                tbody += "<td>" + fusEscHtml(reg) + "</td>";
                tbody += "<td>" + fusEscHtml(last) + "</td>";
                tbody += "<td>" + Number(r.period_logins || 0).toLocaleString() + "</td>";
                tbody += "<td>" + Number(r.total_logins || 0).toLocaleString() + "</td>";
                tbody += "<td>" + fusEscHtml(r.mobile || "—") + "</td>";
                tbody += "<td>" + fusEscHtml(r.indstate || "—") + "</td>";
                tbody += "<td class=\\"fus-mono\\">" + fusEscHtml(r.drn || "—") + "</td>";
                tbody += "</tr>";
            });
            tbody += "</tbody>";

            body.innerHTML = \'<div class="fus-table-wrap"><table class="fus-table">\' + thead + tbody + "</table></div>";

            if (pager) {
                var cur = Number(d.paged || 1);
                var tp = Number(d.total_pages || 1);
                var prevDisabled = cur <= 1 ? " disabled" : "";
                var nextDisabled = cur >= tp ? " disabled" : "";
                pager.innerHTML =
                    "<span>Page " + cur + " of " + tp + "</span>" +
                    "<button type=\\"button\\"" + prevDisabled + " onclick=\\"fusLoadLoginDrilldown(" + (cur - 1) + ")\\">Prev</button>" +
                    "<button type=\\"button\\"" + nextDisabled + " onclick=\\"fusLoadLoginDrilldown(" + (cur + 1) + ")\\">Next</button>";
                pager.style.display = "flex";
            }
        })
        .catch(function(){
            body.innerHTML = \'<div class="fus-trend-drill-empty">Could not load users for this period.</div>\';
        });
}

function fusLoadCourseLearners(courseId, page) {
    courseId = parseInt(courseId || 0, 10);
    page = parseInt(page || 1, 10);
    if (!courseId || page < 1) return false;
    fusCourseState.courseId = courseId;
    fusCourseState.paged = page;

    var body = document.getElementById("fus-course-drill-body");
    var pager = document.getElementById("fus-course-drill-pager");
    var title = document.getElementById("fus-course-drill-title");
    var count = document.getElementById("fus-course-drill-count");
    if (!body) return false;
    body.innerHTML = \'<div class="fus-trend-drill-empty">Loading learners...</div>\';
    if (pager) pager.style.display = "none";

    var params = new URLSearchParams(window.location.search || "");
    var dateFrom = params.get("course_date_from") || "";
    var dateTo = params.get("course_date_to") || "";
    var period = params.get("course_period") || "";
    var url = ' . json_encode(admin_url('admin-ajax.php?action=fus_get_course_learners')) . '
        + "&nonce=" + encodeURIComponent(fusNonces.courseLearners)
        + "&course_id=" + encodeURIComponent(String(courseId))
        + "&paged=" + encodeURIComponent(String(page))
        + "&per_page=" + encodeURIComponent(String(fusCourseState.perPage))
        + "&course_period=" + encodeURIComponent(period)
        + "&date_from=" + encodeURIComponent(dateFrom)
        + "&date_to=" + encodeURIComponent(dateTo);

    fetch(url)
        .then(function(r){ return r.json(); })
        .then(function(res){
            if (!res || !res.success || !res.data) {
                body.innerHTML = \'<div class="fus-trend-drill-empty">Could not load learner data.</div>\';
                return;
            }
            var d = res.data;
            var rows = Array.isArray(d.rows) ? d.rows : [];
            if (title) title.innerText = "Learners: " + String(d.course_title || ("Course #" + courseId));
            if (count) count.innerText = Number(d.total || 0).toLocaleString() + " learners";

            if (!rows.length) {
                body.innerHTML = \'<div class="fus-trend-drill-empty">No learners found for this course in the selected period.</div>\';
            } else {
                var offset = (Number(d.paged || 1) - 1) * Number(d.per_page || fusCourseState.perPage);
                var html = \'<div class="fus-table-wrap"><table class="fus-table"><thead><tr><th>#</th><th>User</th><th>Email</th><th>Status</th><th>Progress</th><th>Started At</th><th>Completed At</th><th>Last Activity</th></tr></thead><tbody>\';
                rows.forEach(function(r, idx){
                    var status = String(r.status || "enrolled");
                    var statusClass = "fus-status";
                    if (status === "completed") statusClass += " fus-status-approved";
                    else if (status === "started") statusClass += " fus-status-pending";
                    var started = r.started_at ? new Date(String(r.started_at).replace(" ", "T")) : null;
                    var completed = r.completed_at ? new Date(String(r.completed_at).replace(" ", "T")) : null;
                    var last = r.last_activity ? new Date(String(r.last_activity).replace(" ", "T")) : null;
                    var startedText = started && !isNaN(started.getTime()) ? started.toLocaleString() : "—";
                    var completedText = completed && !isNaN(completed.getTime()) ? completed.toLocaleString() : "—";
                    var lastText = last && !isNaN(last.getTime()) ? last.toLocaleString() : "—";
                    html += "<tr>";
                    html += "<td>" + String(offset + idx + 1) + "</td>";
                    html += "<td><strong>" + fusEscHtml(r.display_name || "") + "</strong></td>";
                    html += "<td class=\\"fus-mono\\">" + (r.user_email ? fusEscHtml(r.user_email) : "<span class=\\"fus-nil\\">—</span>") + "</td>";
                    html += "<td><span class=\\"" + statusClass + "\\">" + fusEscHtml(status.charAt(0).toUpperCase() + status.slice(1)) + "</span></td>";
                    html += "<td class=\\"fus-mono\\">" + Number(r.progress || 0).toFixed(1) + "%</td>";
                    html += "<td class=\\"fus-mono\\">" + fusEscHtml(startedText) + "</td>";
                    html += "<td class=\\"fus-mono\\">" + fusEscHtml(completedText) + "</td>";
                    html += "<td class=\\"fus-mono\\">" + fusEscHtml(lastText) + "</td>";
                    html += "</tr>";
                });
                html += "</tbody></table></div>";
                if (d.note) html += "<div style=\\"padding:10px 12px;border-top:1px solid #ececf0;font-size:12px;color:#6e6e73;\\">&#x2139; " + fusEscHtml(d.note) + "</div>";
                body.innerHTML = html;
            }

            if (pager) {
                var cur = Number(d.paged || 1);
                var tp = Number(d.total_pages || 1);
                var prevDisabled = cur <= 1 ? " disabled" : "";
                var nextDisabled = cur >= tp ? " disabled" : "";
                pager.innerHTML =
                    "<span>Page " + cur + " of " + tp + "</span>" +
                    "<button type=\\"button\\"" + prevDisabled + " onclick=\\"fusLoadCourseLearners(" + courseId + ", " + (cur - 1) + ")\\">Prev</button>" +
                    "<button type=\\"button\\"" + nextDisabled + " onclick=\\"fusLoadCourseLearners(" + courseId + ", " + (cur + 1) + ")\\">Next</button>";
                pager.style.display = "flex";
            }

            var currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set("tab", "courses");
            currentUrl.searchParams.set("course_id", String(courseId));
            currentUrl.searchParams.set("course_paged", String(page));
            window.history.replaceState({}, "", currentUrl.toString());
        })
        .catch(function(){
            body.innerHTML = \'<div class="fus-trend-drill-empty">Could not load learner data.</div>\';
        });

    return false;
}

function fusRenderStateChart(payload) {
    var canvas = document.getElementById("fusStateCanvas");
    if (!canvas || !payload || !payload.labels || !payload.labels.length) return;
    var colors = [
        "#0071e3", "#34c759", "#ff9f0a", "#5ac8fa", "#ff375f", "#30b0c7",
        "#bf5af2", "#ff3b30", "#0a84ff", "#64d2ff", "#ffd60a", "#4cd964"
    ];
    var bg = payload.labels.map(function(_, i){ return colors[i % colors.length]; });
    var ctx = canvas.getContext("2d");
    if (fusStateChart) fusStateChart.destroy();
    fusStateChart = new Chart(ctx, {
        plugins: [{
            id: "valueLabels",
            afterDatasetsDraw: function(chart) {
                var c = chart.ctx;
                var meta = chart.getDatasetMeta(0);
                var vals = (chart.data.datasets[0] && chart.data.datasets[0].data) ? chart.data.datasets[0].data : [];
                c.save();
                c.font = "600 11px Inter";
                c.fillStyle = "#ffffff";
                c.textAlign = "center";
                c.textBaseline = "middle";
                meta.data.forEach(function(arc, i) {
                    var raw = Number(vals[i] || 0);
                    if (!raw) return;
                    var p = arc.tooltipPosition();
                    c.fillText(raw.toLocaleString(), p.x, p.y);
                });
                c.restore();
            }
        }],
        type: "pie",
        data: {
            labels: payload.labels,
            datasets: [{
                data: payload.data,
                backgroundColor: bg,
                borderColor: "#ffffff",
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        boxWidth: 10,
                        boxHeight: 10,
                        padding: 14,
                        color: "#6e6e73",
                        font: { family: "Inter", size: 11, weight: "600" }
                    }
                },
                tooltip: {
                    backgroundColor: "#1d1d1f",
                    titleFont: { family: "Inter", size: 12 },
                    bodyFont: { family: "Inter", size: 12 },
                    callbacks: {
                        label: function(ctx) {
                            var total = payload.data.reduce(function(a,b){ return a + b; }, 0) || 1;
                            var val = Number(ctx.parsed || 0);
                            var pct = ((val / total) * 100).toFixed(1);
                            return " " + val.toLocaleString() + " (" + pct + "%)";
                        }
                    }
                }
            }
        }
    });
}

function fusOpenUserGraph(userId, userName) {
    fetch(' . json_encode(admin_url('admin-ajax.php?action=fus_get_user_activity')) . ' + "&user_id=" + userId)
        .then(function(r){return r.json();})
        .then(function(res){
            if(res.success) {
                var d = res.data;
                var metaHtml = \'<div class="fus-chart-meta-item"><div class="fus-chart-meta-label">Total Logins</div><div class="fus-chart-meta-value">\' + d.login_count.toLocaleString() + \'</div></div>\';
                fusOpenChart("Activity: " + userName, d.labels, d.data, "rgba(16,185,129,1)", metaHtml, true);
            }
        });
}

// Login Trend Tab
function fusLoadLoginTrend(range) {
    document.querySelectorAll(".fus-trend-period-btn").forEach(function(b){b.classList.remove("active");});
    document.getElementById("btn-" + range).classList.add("active");
    fusLoginSelected = null;
    fusLoginTableState = { paged: 1, perPage: 20, orderby: "period_logins", order: "DESC" };
    var drillBody = document.getElementById("fus-login-drill-body");
    var drillTitle = document.getElementById("fus-login-drill-title");
    var drillCount = document.getElementById("fus-login-drill-count");
    var drillPager = document.getElementById("fus-login-drill-pager");
    if (drillBody) drillBody.innerHTML = \'<div class="fus-trend-drill-empty">Click a bar to view users for that period.</div>\';
    if (drillTitle) drillTitle.innerText = "Login Users";
    if (drillCount) drillCount.innerText = "";
    if (drillPager) drillPager.style.display = "none";

    var params = new URLSearchParams(window.location.search || "");
    var includeInternal = params.get("include_internal");
    var url = ' . json_encode(admin_url('admin-ajax.php?action=fus_get_login_trend')) . ' + "&range=" + range;
    if (includeInternal === "0") url += "&include_internal=0";
    fetch(url)
        .then(function(r){return r.json();})
        .then(function(res){
            if(!res.success) return;
            var d = res.data;
            document.getElementById("fus-stat-unique").innerText = d.unique_ever.toLocaleString();
            document.getElementById("fus-stat-total").innerText  = d.total_logins.toLocaleString();
            var avg = d.unique_ever > 0 ? (d.total_logins / d.unique_ever).toFixed(1) : "0";
            document.getElementById("fus-stat-avg").innerText = avg;
            var ctx = document.getElementById("fusLoginCanvas");
            if(!ctx) return;
            ctx = ctx.getContext("2d");
            if(fusLoginChart) fusLoginChart.destroy();
            fusLoginChart = new Chart(ctx, {
                plugins: [{
                    id: "fusLoginBarValueLabels",
                    afterDatasetsDraw: function(chart) {
                        var c = chart.ctx;
                        var meta = chart.getDatasetMeta(0);
                        var vals = (chart.data.datasets[0] && chart.data.datasets[0].data) ? chart.data.datasets[0].data : [];
                        c.save();
                        c.font = "600 10px Inter";
                        c.fillStyle = "#334155";
                        c.textAlign = "center";
                        c.textBaseline = "bottom";
                        meta.data.forEach(function(bar, i) {
                            var raw = Number(vals[i] || 0);
                            var p = bar.tooltipPosition();
                            c.fillText(raw.toLocaleString(), p.x, p.y - 6);
                        });
                        c.restore();
                    }
                }],
                type: "bar",
                data: {
                    labels: d.labels,
                    datasets: [{
                        label: range === "monthly" ? "Logins per Month" : "Logins per Day",
                        data: d.data,
                        backgroundColor: "rgba(0,113,227,0.68)",
                        borderColor: "rgba(0,113,227,1)",
                        borderWidth: 0,
                        borderRadius: 4,
                        hoverBackgroundColor: "rgba(0,113,227,0.88)"
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: function(evt, elements){
                        if (!elements || !elements.length) return;
                        var idx = elements[0].index;
                        var key = (d.keys && d.keys[idx]) ? d.keys[idx] : null;
                        if (!key) return;
                        fusLoginSelected = {
                            range: range,
                            periodKey: key,
                            periodLabel: (d.labels && d.labels[idx]) ? d.labels[idx] : key
                        };
                        fusLoadLoginDrilldown(1);
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: "top",
                            labels: { color: "#6e6e73", font: { family: "Inter", size: 11, weight: "600" } }
                        },
                        tooltip: {
                            backgroundColor: "#0f172a",
                            padding: 10,
                            titleFont: { family: "Inter", size: 12 },
                            bodyFont:  { family: "Inter", size: 13 },
                            callbacks: { label: function(c){ return " " + c.parsed.y.toLocaleString() + " logins"; } }
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { family: "Inter", size: 11 }, color: "#8e8e93", maxRotation: 45 } },
                        y: { beginAtZero: true, ticks: { precision: 0, font: { family: "Inter", size: 11 }, color: "#8e8e93" }, grid: { color: "#ececf0" } }
                    }
                }
            });
        });
}

// Auto-load login trend if on that tab
' . ($active_tab === 'logins' ? 'document.addEventListener("DOMContentLoaded", function(){ fusLoadLoginTrend("daily"); });' : '') . '
' . ($active_tab === 'overview' ? 'document.addEventListener("DOMContentLoaded", function(){ fusRefreshCards(); setInterval(fusRefreshCards, 15000); });' : '') . '
' . ($active_tab === 'states' ? 'document.addEventListener("DOMContentLoaded", function(){ var data = ' . $state_chart_payload . '; fusRenderStateChart(data); });' : '') . '
</script>';
}
