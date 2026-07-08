--
-- PostgreSQL database dump
--

\restrict rzfdjzVp7nBR10CZanW1tt9jGi1uBMQeiis8t1JfnDmOVNCivPaJ68Jd35CBAmL

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: postgres
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: postgres
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: postgres
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: admin_password_reset_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_password_reset_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.admin_password_reset_tokens OWNER TO postgres;

--
-- Name: admin_password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.admin_password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admin_password_reset_tokens_id_seq OWNER TO postgres;

--
-- Name: admin_password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.admin_password_reset_tokens_id_seq OWNED BY public.admin_password_reset_tokens.id;


--
-- Name: admin_sensitive_auth; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_sensitive_auth (
    id integer NOT NULL,
    user_id integer NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.admin_sensitive_auth OWNER TO postgres;

--
-- Name: admin_sensitive_auth_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.admin_sensitive_auth_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admin_sensitive_auth_id_seq OWNER TO postgres;

--
-- Name: admin_sensitive_auth_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.admin_sensitive_auth_id_seq OWNED BY public.admin_sensitive_auth.id;


--
-- Name: bill_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bill_links (
    id uuid NOT NULL,
    order_id integer NOT NULL,
    image_blob_id uuid NOT NULL,
    hmac_signature text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    short_id text DEFAULT ''::text NOT NULL,
    opened_at timestamp without time zone
);


ALTER TABLE public.bill_links OWNER TO postgres;

--
-- Name: image_blobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.image_blobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data text NOT NULL,
    content_type text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.image_blobs OWNER TO postgres;

--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.menu_categories (
    id integer NOT NULL,
    restaurant_id integer NOT NULL,
    name text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.menu_categories OWNER TO postgres;

--
-- Name: menu_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.menu_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.menu_categories_id_seq OWNER TO postgres;

--
-- Name: menu_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.menu_categories_id_seq OWNED BY public.menu_categories.id;


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.menu_items (
    id integer NOT NULL,
    restaurant_id integer NOT NULL,
    category_id integer NOT NULL,
    name text NOT NULL,
    description text,
    price double precision NOT NULL,
    image_url text,
    is_available boolean DEFAULT true NOT NULL,
    is_veg boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.menu_items OWNER TO postgres;

--
-- Name: menu_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.menu_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.menu_items_id_seq OWNER TO postgres;

--
-- Name: menu_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.menu_items_id_seq OWNED BY public.menu_items.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    restaurant_id integer,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notifications_id_seq OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    menu_item_id integer,
    name text NOT NULL,
    quantity integer NOT NULL,
    unit_price double precision NOT NULL,
    is_veg boolean DEFAULT true NOT NULL,
    notes text
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    restaurant_id integer NOT NULL,
    table_id integer,
    table_number text,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    status text DEFAULT 'ordered'::text NOT NULL,
    subtotal double precision NOT NULL,
    tax double precision DEFAULT 0 NOT NULL,
    total double precision NOT NULL,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    payment_method text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    payment_screenshot_url text,
    payment_ocr_data text,
    payment_verification_status text,
    razorpay_order_id text,
    razorpay_payment_id text,
    paid_at timestamp without time zone,
    verification_method text,
    verified_by integer,
    verified_at timestamp without time zone,
    session_id integer
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: owner_password_reset_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.owner_password_reset_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.owner_password_reset_tokens OWNER TO postgres;

--
-- Name: owner_password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.owner_password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.owner_password_reset_tokens_id_seq OWNER TO postgres;

--
-- Name: owner_password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.owner_password_reset_tokens_id_seq OWNED BY public.owner_password_reset_tokens.id;


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.platform_settings OWNER TO postgres;

--
-- Name: rate_limit_windows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rate_limit_windows (
    key text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    count integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.rate_limit_windows OWNER TO postgres;

--
-- Name: resources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resources (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    type text NOT NULL,
    category text,
    thumbnail text,
    url text,
    file_url text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    approval_status text DEFAULT 'pending'::text NOT NULL,
    visible_to text DEFAULT 'all'::text NOT NULL,
    created_by integer,
    approved_by integer,
    publish_at timestamp without time zone,
    expire_at timestamp without time zone,
    duration text,
    video_source text,
    size_label text,
    plan_name text,
    plan_price text,
    plan_period text,
    plan_features text[] DEFAULT '{}'::text[],
    plan_highlight boolean DEFAULT false,
    plan_badge text,
    plan_cta text,
    icon_name text,
    icon_color text,
    question text,
    answer text,
    updated_by integer,
    review_notes text,
    rejection_reason text,
    deleted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.resources OWNER TO postgres;

--
-- Name: resources_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.resources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.resources_id_seq OWNER TO postgres;

--
-- Name: resources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.resources_id_seq OWNED BY public.resources.id;


--
-- Name: restaurant_tables; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.restaurant_tables (
    id integer NOT NULL,
    restaurant_id integer NOT NULL,
    table_number text NOT NULL,
    area text,
    qr_code_url text,
    is_occupied boolean DEFAULT false NOT NULL
);


ALTER TABLE public.restaurant_tables OWNER TO postgres;

--
-- Name: restaurant_tables_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.restaurant_tables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.restaurant_tables_id_seq OWNER TO postgres;

--
-- Name: restaurant_tables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.restaurant_tables_id_seq OWNED BY public.restaurant_tables.id;


--
-- Name: restaurants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.restaurants (
    id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    cuisine_type text NOT NULL,
    logo_url text,
    address text,
    city text NOT NULL,
    state text,
    district text,
    phone text NOT NULL,
    email text NOT NULL,
    owner_id integer,
    is_active boolean DEFAULT true NOT NULL,
    upi_id text,
    whatsapp_number text,
    tax_percent integer DEFAULT 5 NOT NULL,
    seating_label text,
    razorpay_key_id text,
    razorpay_key_secret text,
    approval_status text DEFAULT 'approved'::text NOT NULL,
    approval_note text,
    subscription_plan text DEFAULT 'free'::text NOT NULL,
    subscription_fee double precision DEFAULT 0 NOT NULL,
    subscription_expires_at timestamp without time zone,
    plan_id integer,
    customers_used integer DEFAULT 0 NOT NULL,
    customer_limit integer DEFAULT 0 NOT NULL,
    subscription_status text DEFAULT 'active'::text NOT NULL,
    subscription_started_at timestamp without time zone,
    terms_accepted boolean DEFAULT false NOT NULL,
    privacy_accepted boolean DEFAULT false NOT NULL,
    accepted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    upi_name text,
    personal_upi_enabled boolean DEFAULT false NOT NULL,
    upi_verified boolean DEFAULT false NOT NULL,
    verified_at timestamp without time zone,
    qr_image_data text,
    qr_decoded_payload text,
    qr_merchant_name text,
    payment_qr_enabled boolean DEFAULT false NOT NULL,
    qr_extracted_upi_id text,
    razorpay_webhook_secret text,
    whatsapp_status text DEFAULT 'disconnected'::text NOT NULL,
    whatsapp_phone text
);


ALTER TABLE public.restaurants OWNER TO postgres;

--
-- Name: restaurants_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.restaurants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.restaurants_id_seq OWNER TO postgres;

--
-- Name: restaurants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.restaurants_id_seq OWNED BY public.restaurants.id;


--
-- Name: session_bills; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.session_bills (
    id integer NOT NULL,
    session_id integer NOT NULL,
    restaurant_id integer NOT NULL,
    bill_number text NOT NULL,
    subtotal double precision NOT NULL,
    tax double precision DEFAULT 0 NOT NULL,
    total double precision NOT NULL,
    status text DEFAULT 'generated'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    customer_phone text,
    sent_at timestamp without time zone,
    screenshot_url text,
    screenshot_received_at timestamp without time zone,
    verified_at timestamp without time zone,
    verified_by integer,
    resent_at timestamp without time zone,
    resent_count integer DEFAULT 0 NOT NULL,
    sender_phone text,
    phone_mismatch boolean DEFAULT false NOT NULL,
    CONSTRAINT session_bills_status_check CHECK ((status = ANY (ARRAY['generated'::text, 'sent'::text, 'awaiting_verification'::text, 'paid'::text, 'cancelled'::text])))
);


ALTER TABLE public.session_bills OWNER TO postgres;

--
-- Name: session_bills_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.session_bills_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.session_bills_id_seq OWNER TO postgres;

--
-- Name: session_bills_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.session_bills_id_seq OWNED BY public.session_bills.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.sessions OWNER TO postgres;

--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscription_plans (
    id integer NOT NULL,
    name text NOT NULL,
    price double precision DEFAULT 0 NOT NULL,
    customer_limit integer DEFAULT 0 NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    validity_type text DEFAULT 'days'::text NOT NULL,
    validity_value integer DEFAULT 30 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.subscription_plans OWNER TO postgres;

--
-- Name: subscription_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.subscription_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subscription_plans_id_seq OWNER TO postgres;

--
-- Name: subscription_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.subscription_plans_id_seq OWNED BY public.subscription_plans.id;


--
-- Name: subscription_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscription_transactions (
    id integer NOT NULL,
    restaurant_id integer NOT NULL,
    plan_id integer NOT NULL,
    amount double precision NOT NULL,
    payment_method text DEFAULT 'razorpay'::text NOT NULL,
    razorpay_order_id text,
    razorpay_payment_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    customers_added integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.subscription_transactions OWNER TO postgres;

--
-- Name: subscription_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.subscription_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subscription_transactions_id_seq OWNER TO postgres;

--
-- Name: subscription_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.subscription_transactions_id_seq OWNED BY public.subscription_transactions.id;


--
-- Name: table_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.table_sessions (
    id integer NOT NULL,
    restaurant_id integer NOT NULL,
    table_number text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    session_type text DEFAULT 'dine_in'::text NOT NULL,
    customer_phone text,
    CONSTRAINT table_sessions_session_type_check CHECK ((session_type = ANY (ARRAY['dine_in'::text, 'takeaway'::text]))),
    CONSTRAINT table_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'awaiting_payment'::text, 'awaiting_verification'::text, 'paid'::text, 'closed'::text])))
);


ALTER TABLE public.table_sessions OWNER TO postgres;

--
-- Name: table_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.table_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.table_sessions_id_seq OWNER TO postgres;

--
-- Name: table_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.table_sessions_id_seq OWNED BY public.table_sessions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text NOT NULL,
    role text DEFAULT 'owner'::text NOT NULL,
    restaurant_id integer,
    temp_password text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: admin_password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.admin_password_reset_tokens_id_seq'::regclass);


--
-- Name: admin_sensitive_auth id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_sensitive_auth ALTER COLUMN id SET DEFAULT nextval('public.admin_sensitive_auth_id_seq'::regclass);


--
-- Name: menu_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_categories ALTER COLUMN id SET DEFAULT nextval('public.menu_categories_id_seq'::regclass);


--
-- Name: menu_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items ALTER COLUMN id SET DEFAULT nextval('public.menu_items_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: owner_password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.owner_password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.owner_password_reset_tokens_id_seq'::regclass);


--
-- Name: resources id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources ALTER COLUMN id SET DEFAULT nextval('public.resources_id_seq'::regclass);


--
-- Name: restaurant_tables id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restaurant_tables ALTER COLUMN id SET DEFAULT nextval('public.restaurant_tables_id_seq'::regclass);


--
-- Name: restaurants id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restaurants ALTER COLUMN id SET DEFAULT nextval('public.restaurants_id_seq'::regclass);


--
-- Name: session_bills id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_bills ALTER COLUMN id SET DEFAULT nextval('public.session_bills_id_seq'::regclass);


--
-- Name: subscription_plans id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_plans ALTER COLUMN id SET DEFAULT nextval('public.subscription_plans_id_seq'::regclass);


--
-- Name: subscription_transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_transactions ALTER COLUMN id SET DEFAULT nextval('public.subscription_transactions_id_seq'::regclass);


--
-- Name: table_sessions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.table_sessions ALTER COLUMN id SET DEFAULT nextval('public.table_sessions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: postgres
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
1	a6bf39bb001960e594308160942ddfd74a820617faab69f986ccc6b123088432	1778837306391
2	5b959ea3b208cbfaf9026776cff7208010e15333e5b8fd98d3572bd854f31964	1748000000000
3	63b7ff4a240e1d7b1ac23e049c9357bbfd2e6d4e2071ad57a273623951108629	1748086400000
4	18b466bbfed761169b489e90ef45dfe30b2e88cd9b030347bf025a2bf554cf0d	1748172800000
5	d4cec46747737d610c98487970ba0fcc0bcc541846901550afdc05c4d90691c8	1748259200000
6	d880225722a55383006d2353acd6dc44fb5b4ceb95d6238b20b6c5b48b68cb68	1748345600000
7	1b4e3340d26db4adaa39fb214f6d017835f19cdc17d20d0d72899273bf4fbedf	1748432000000
8	3c1ad21de25bb5d193162927f5df1be39ab33b8d8acb056b54e0349328316727	1748518400000
9	107ea5fbbbc6d7de4ca1e60a00527a5c461fb9d9e51e46182753852b49638bce	1748604800000
10	b3efdd393684c2457786848bb483e5ce6a0f734d24950fcfea81be7aa400dcca	1748691200000
11	ce6f732ce83a4dbf7fae3a2ed5f076541a8a0b35aa70b64cddc015ca81c81b18	1748777600000
12	c3d8d82971624dfcac09bc8605f0710f22a71f04035eb3c50dd0ee737253130f	1748864000000
13	75d9785bcfd0e3d08f1488b0b092a166effb8fca413a3e27ee5df9d28fb94397	1748950400000
14	182ebbad236115399590ed85d24080b8ecee6dcdce0c2e2c7c73c76154559987	1749036800000
15	ed5573d1b42eb57c86c7e24a611ffc5481f3ec195d38046c756ea33722d236a2	1749123200000
16	8fefdb2f90702e4e1aa9924560322a13627af1a05b02dcfdd7bd70302e648231	1750089600000
17	a29ebc9afd4411c29e2bfc0d56d53a48f4b1a58f598fc7b9b026adeec4f546cb	1750176000000
18	eacf699bd3100c477fcedb9298d3fa99ee49d91a7c7e40a6c1962b905c540174	1750262400000
19	a1f9671fd345c9baabb43afb60f69a192642d279b96c96536b93c2122fe5b8f6	1750348800000
20	6a7ec1d55c77a4b87e32fc9e3582b8e798a254c3dcb7ab5357631634b4e974ba	1750435200000
21	6bbf31ae94980b8d74d1b09308990764e7e4fdb9885b8fcbc32b3e948ab1f633	1750521600000
22	48e8182ded9f55498158c2510436adf239b6622d3b59bd8836396d692e83ce7b	1750608000000
23	066ad5f79bfe023ede70bac2d53499f65eea06f270cb3ed882a2bc3d97cdc220	1750694400000
24	8e049a14091432b25d8a973f054dcbb8cc7bcf611261143392b1bc423c8164bd	1782780800000
25	eb26ce7a120f2fd3e5abafc689964bed186d594502a3cbbe4a50e8d66e976252	1782867200000
26	cbe00e221fa3dee458b5ae4b3c8851273ee01c52162348a03bd4cf7aa2cdc8bf	1783248203000
27	a6dc01e1d8ce4cbf66b92a1a1a7f3ca9f8894e9302f354f0623ea33762b888f5	1783334603000
\.


--
-- Data for Name: admin_password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admin_password_reset_tokens (id, user_id, token, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: admin_sensitive_auth; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admin_sensitive_auth (id, user_id, password_hash, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: bill_links; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bill_links (id, order_id, image_blob_id, hmac_signature, expires_at, created_at, short_id, opened_at) FROM stdin;
\.


--
-- Data for Name: image_blobs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.image_blobs (id, data, content_type, created_at) FROM stdin;
\.


--
-- Data for Name: menu_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.menu_categories (id, restaurant_id, name, display_order, is_active) FROM stdin;
1	1	Starters	1	t
2	1	Main Course	2	t
3	1	Breads	3	t
4	1	Rice & Biryani	4	t
5	1	Desserts	5	t
6	1	Beverages	6	t
\.


--
-- Data for Name: menu_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.menu_items (id, restaurant_id, category_id, name, description, price, image_url, is_available, is_veg, display_order) FROM stdin;
1	1	1	Veg Samosa (2 pcs)	Crispy pastry filled with spiced potatoes	8000	\N	t	t	1
2	1	1	Chicken Tikka	Tender chicken marinated in yoghurt and spices	28000	\N	t	f	2
3	1	1	Paneer Tikka	Chargrilled cottage cheese with peppers	24000	\N	t	t	3
4	1	1	Hara Bhara Kebab	Green pea and spinach patties	19000	\N	t	t	4
5	1	2	Butter Chicken	Tender chicken in rich tomato-cream sauce	32000	\N	t	f	1
6	1	2	Dal Makhani	Slow-cooked black lentils with butter and cream	28000	\N	t	t	2
7	1	2	Palak Paneer	Cottage cheese in creamy spinach gravy	27000	\N	t	t	3
8	1	2	Mutton Rogan Josh	Slow-braised mutton in Kashmiri spices	42000	\N	t	f	4
9	1	2	Shahi Paneer	Paneer in rich cashew and tomato gravy	29000	\N	t	t	5
10	1	3	Butter Naan	Soft leavened flatbread with butter	5000	\N	t	t	1
11	1	3	Garlic Naan	Naan topped with garlic butter	6000	\N	t	t	2
12	1	3	Laccha Paratha	Flaky whole-wheat layered bread	5500	\N	t	t	3
13	1	4	Chicken Biryani	Aromatic basmati with spiced chicken	38000	\N	t	f	1
14	1	4	Veg Biryani	Fragrant basmati with seasonal vegetables	26000	\N	t	t	2
15	1	4	Jeera Rice	Steamed basmati with cumin	15000	\N	t	t	3
16	1	5	Gulab Jamun (2 pcs)	Soft milk dumplings in rose-cardamom syrup	12000	\N	t	t	1
17	1	5	Kulfi	Traditional Indian ice cream	15000	\N	t	t	2
18	1	6	Mango Lassi	Chilled yoghurt blended with Alphonso mango	13000	\N	t	t	1
19	1	6	Masala Chai	Spiced Indian tea with milk	5000	\N	t	t	2
20	1	6	Fresh Lime Soda	Sweet or salted lime soda	8000	\N	t	t	3
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, restaurant_id, title, message, type, is_read, created_at) FROM stdin;
1	1	Subscription Activated	Your Starter plan is now active. 500 customer quota added. Valid till 5 Aug 2026.	success	f	2026-07-05 14:04:09.176644
2	1	Subscription Activated	Your Starter plan is now active. 500 customer quota added. Valid till 5 Aug 2026.	success	f	2026-07-05 14:04:23.245256
3	1	Subscription Activated	Your Starter plan is now active. 500 customer quota added. Valid till 5 Aug 2026.	success	f	2026-07-05 14:06:11.450746
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, menu_item_id, name, quantity, unit_price, is_veg, notes) FROM stdin;
1	1	1	Veg Samosa (2 pcs)	1	8000	t	\N
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, restaurant_id, table_id, table_number, customer_name, customer_phone, status, subtotal, tax, total, payment_status, payment_method, notes, created_at, updated_at, payment_screenshot_url, payment_ocr_data, payment_verification_status, razorpay_order_id, razorpay_payment_id, paid_at, verification_method, verified_by, verified_at, session_id) FROM stdin;
1	1	1	\N	Verification Test	919999999999	ordered	8000	400	8400	unpaid	cash	\N	2026-07-04 11:40:02.464077	2026-07-04 11:40:02.463	\N	\N	\N	\N	\N	\N	\N	\N	\N	1
\.


--
-- Data for Name: owner_password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.owner_password_reset_tokens (id, user_id, token, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.platform_settings (key, value, updated_at) FROM stdin;
platform_upi_id	bitebend@upi	2026-07-03 10:27:34.81
\.


--
-- Data for Name: rate_limit_windows; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.rate_limit_windows (key, expires_at, count) FROM stdin;
\.


--
-- Data for Name: resources; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resources (id, title, description, type, category, thumbnail, url, file_url, tags, featured, display_order, status, approval_status, visible_to, created_by, approved_by, publish_at, expire_at, duration, video_source, size_label, plan_name, plan_price, plan_period, plan_features, plan_highlight, plan_badge, plan_cta, icon_name, icon_color, question, answer, updated_by, review_notes, rejection_reason, deleted_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: restaurant_tables; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.restaurant_tables (id, restaurant_id, table_number, area, qr_code_url, is_occupied) FROM stdin;
2	1	T2	Ground Floor	\N	f
3	1	T3	Ground Floor	\N	f
4	1	T4	First Floor	\N	f
5	1	T5	First Floor	\N	f
6	1	T6	Rooftop	\N	f
1	1	T1	Ground Floor	\N	t
\.


--
-- Data for Name: restaurants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.restaurants (id, name, slug, description, cuisine_type, logo_url, address, city, state, district, phone, email, owner_id, is_active, upi_id, whatsapp_number, tax_percent, seating_label, razorpay_key_id, razorpay_key_secret, approval_status, approval_note, subscription_plan, subscription_fee, subscription_expires_at, plan_id, customers_used, customer_limit, subscription_status, subscription_started_at, terms_accepted, privacy_accepted, accepted_at, created_at, upi_name, personal_upi_enabled, upi_verified, verified_at, qr_image_data, qr_decoded_payload, qr_merchant_name, payment_qr_enabled, qr_extracted_upi_id, razorpay_webhook_secret, whatsapp_status, whatsapp_phone) FROM stdin;
1	Spice Garden	spice-garden	Authentic Indian cuisine in the heart of the city	North Indian	\N	\N	Mumbai	Maharashtra	\N	9876543210	demo@spicegarden.com	2	t	spicegarden@upi	9876543210	5	Table	\N	\N	approved	\N	free	0	2026-08-05 14:06:11.376	1	0	2000	active	2026-07-05 14:06:11.376	t	t	2026-07-03 10:27:34.942	2026-07-03 10:27:34.943597	\N	f	f	\N	\N	\N	\N	f	\N	\N	disconnected	\N
\.


--
-- Data for Name: session_bills; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.session_bills (id, session_id, restaurant_id, bill_number, subtotal, tax, total, status, created_at, updated_at, customer_phone, sent_at, screenshot_url, screenshot_received_at, verified_at, verified_by, resent_at, resent_count, sender_phone, phone_mismatch) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (sid, sess, expire) FROM stdin;
P7RHfIlZrRlHkEqv4kQ0JJ7vHS0HJKjT	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-10T10:28:08.701Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-10 10:28:09
oAS966imqL2Nrsp5g2xyAGPuc--pV6S1	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-11T11:17:08.766Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-11 11:17:09
rSyZLfKHD7DBhyCAZeSGl3lbzJeM_U79	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-11T11:26:20.395Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-11 11:26:21
SFfUhqsx3l1SSQ6le9M9-W345yp6cXUe	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-11T11:28:23.608Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-11 11:28:24
uKo15MwtpX9t8GI3Z6QC3q6TrWcF827K	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-11T11:28:42.750Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-11 11:28:43
TM3LK1SUCk59ilN-VZZIaKUaRdTy9HX7	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-11T11:29:01.541Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-11 11:29:02
SK5sHrdjoaSuU7isfbYKa5IuRdTGMNjw	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-11T11:29:24.748Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-11 11:29:25
cnf1Qz6Itjhax4cXGWDupjDbN5-KzAsK	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-11T11:30:19.682Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-11 11:30:21
z3bH0OKNzK-FPMHveEFf7gAX6ywynUHC	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-11T11:39:54.240Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-11 11:39:55
cIo0ccpyTu_EK67E0W3e6QMlI6EduzxY	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-12T11:30:05.287Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-12 11:30:35
suKPIzMAhTKEOnsNxY9z-WbcEQd0V3Yw	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-11T11:40:20.669Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-11 11:40:22
yrFSMIXMZEGsXRiSV36wI0rHkkUxB2gj	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-11T11:40:42.036Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-11 11:40:43
hgfYsW3YT_bZX_7Pt30BHxt-GbI2UBSb	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-11T11:41:12.005Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-11 11:41:13
d5b5XGwskjE_yEDLmEZ6UjpjkLeh3SOG	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-12T11:29:03.480Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-12 11:29:04
tsJA2Sw4GozBiveZ5iK7EOwqPc6I2sRD	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-12T11:29:29.797Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-12 11:29:30
9vkxHY7ytDqML8hUSMa9Vay1eODG8wIA	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-12T11:29:55.877Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-12 11:29:56
yJvwxhdMLGG5dNLlHdl6Z958KcL8Qu5Z	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-13T08:14:34.998Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":1}	2026-07-13 08:15:19
YegDytpWZa4GYWZM5z7uStueCj9CTE4h	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-12T13:52:24.469Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-12 13:53:20
f14kBlQuUNI9adPwRTeXr6w7CXSgUBm8	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-12T13:52:54.410Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":1}	2026-07-12 13:53:20
ZJm47EbvTStJcTIPtdOxn51Bx25iRFsB	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-12T14:06:11.063Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-12 14:06:12
m_FwS_sP13BiZIOxWCZmQaAl-TU2cX73	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-13T08:14:08.722Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":1}	2026-07-13 08:14:09
VR1hLNEFPQ9ecnHBzqWxhilvCcsXgRGp	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-12T14:03:19.093Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":2}	2026-07-12 14:04:24
8IPzn0DCip7BJIlHJncZ-0Rnb05wy8mF	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-13T08:14:16.957Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":1}	2026-07-13 08:14:17
uxNEeOYxTABnbt8rTOznnvIoKODU5nqq	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-13T08:16:46.076Z","secure":true,"httpOnly":true,"path":"/","sameSite":"none"},"userId":1}	2026-07-13 08:16:56
\.


--
-- Data for Name: subscription_plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.subscription_plans (id, name, price, customer_limit, description, is_active, display_order, validity_type, validity_value, created_at) FROM stdin;
2	Growth	49900	2000	For growing restaurants	t	2	months	1	2026-07-03 10:27:34.799714
3	Pro	99900	5000	For established restaurants	t	3	months	1	2026-07-03 10:27:34.804228
4	Unlimited	199900	999999	No customer limit — scale freely	t	4	months	1	2026-07-03 10:27:34.807453
1	Starter	19900	500	Perfect for new restaurants	t	1	months	1	2026-07-03 10:27:34.79512
\.


--
-- Data for Name: subscription_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.subscription_transactions (id, restaurant_id, plan_id, amount, payment_method, razorpay_order_id, razorpay_payment_id, status, customers_added, created_at) FROM stdin;
2	1	1	19900	razorpay	order_TESTFAKE_1783260238624	pay_TESTFAKE_1783260238624	paid	500	2026-07-05 14:04:09.156669
3	1	1	19900	razorpay	order_TESTFAKE_CONC_1783260262411817370	pay_TESTFAKE_CONC_1783260262428810822	paid	500	2026-07-05 14:04:22.864381
6	1	1	19900	razorpay	order_TESTFAKE_CONC2_1783260371105749931	pay_TESTFAKE_CONC2_1783260371119919154	paid	500	2026-07-05 14:06:11.377244
\.


--
-- Data for Name: table_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.table_sessions (id, restaurant_id, table_number, status, created_at, updated_at, session_type, customer_phone) FROM stdin;
1	1	\N	active	2026-07-04 11:40:02.367347	2026-07-04 11:40:02.366	takeaway	919999999999
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, name, role, restaurant_id, temp_password, created_at) FROM stdin;
1	admin@bitebend.in	$2b$10$bta1k1bEGpbtJe9ZVH76pum1DUAQGmgbB4zjdZMDrY29Gy493zmIq	Platform Admin	super_admin	\N	\N	2026-07-03 10:27:34.876266
2	demo@spicegarden.com	$2b$10$KzDm2ppvTlh2YUARyVZ/Eu0SlmWhSN3.MRXJ8IY6fvMJYtEsRJU9a	Spice Garden Owner	owner	1	\N	2026-07-03 10:27:34.936646
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: postgres
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 27, true);


--
-- Name: admin_password_reset_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.admin_password_reset_tokens_id_seq', 1, false);


--
-- Name: admin_sensitive_auth_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.admin_sensitive_auth_id_seq', 1, false);


--
-- Name: menu_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.menu_categories_id_seq', 6, true);


--
-- Name: menu_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.menu_items_id_seq', 20, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notifications_id_seq', 3, true);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_items_id_seq', 7, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_id_seq', 7, true);


--
-- Name: owner_password_reset_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.owner_password_reset_tokens_id_seq', 1, false);


--
-- Name: resources_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.resources_id_seq', 1, false);


--
-- Name: restaurant_tables_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.restaurant_tables_id_seq', 6, true);


--
-- Name: restaurants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.restaurants_id_seq', 1, true);


--
-- Name: session_bills_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.session_bills_id_seq', 1, true);


--
-- Name: subscription_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.subscription_plans_id_seq', 6, true);


--
-- Name: subscription_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.subscription_transactions_id_seq', 7, true);


--
-- Name: table_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.table_sessions_id_seq', 8, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 2, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: admin_password_reset_tokens admin_password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_password_reset_tokens
    ADD CONSTRAINT admin_password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: admin_password_reset_tokens admin_password_reset_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_password_reset_tokens
    ADD CONSTRAINT admin_password_reset_tokens_token_unique UNIQUE (token);


--
-- Name: admin_sensitive_auth admin_sensitive_auth_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_sensitive_auth
    ADD CONSTRAINT admin_sensitive_auth_pkey PRIMARY KEY (id);


--
-- Name: admin_sensitive_auth admin_sensitive_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_sensitive_auth
    ADD CONSTRAINT admin_sensitive_auth_user_id_key UNIQUE (user_id);


--
-- Name: bill_links bill_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bill_links
    ADD CONSTRAINT bill_links_pkey PRIMARY KEY (id);


--
-- Name: image_blobs image_blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.image_blobs
    ADD CONSTRAINT image_blobs_pkey PRIMARY KEY (id);


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: owner_password_reset_tokens owner_password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.owner_password_reset_tokens
    ADD CONSTRAINT owner_password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: owner_password_reset_tokens owner_password_reset_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.owner_password_reset_tokens
    ADD CONSTRAINT owner_password_reset_tokens_token_unique UNIQUE (token);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: rate_limit_windows rate_limit_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rate_limit_windows
    ADD CONSTRAINT rate_limit_windows_pkey PRIMARY KEY (key);


--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);


--
-- Name: restaurant_tables restaurant_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_pkey PRIMARY KEY (id);


--
-- Name: restaurants restaurants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_pkey PRIMARY KEY (id);


--
-- Name: restaurants restaurants_slug_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_slug_unique UNIQUE (slug);


--
-- Name: session_bills session_bills_bill_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_bills
    ADD CONSTRAINT session_bills_bill_number_unique UNIQUE (bill_number);


--
-- Name: session_bills session_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_bills
    ADD CONSTRAINT session_bills_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: subscription_transactions subscription_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_transactions
    ADD CONSTRAINT subscription_transactions_pkey PRIMARY KEY (id);


--
-- Name: table_sessions table_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT table_sessions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: IDX_sessions_expire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_sessions_expire" ON public.sessions USING btree (expire);


--
-- Name: bill_links_expires_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bill_links_expires_at_idx ON public.bill_links USING btree (expires_at);


--
-- Name: bill_links_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bill_links_order_id_idx ON public.bill_links USING btree (order_id);


--
-- Name: bill_links_short_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX bill_links_short_id_idx ON public.bill_links USING btree (short_id);


--
-- Name: idx_orders_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_session_id ON public.orders USING btree (session_id);


--
-- Name: idx_rate_limit_windows_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rate_limit_windows_expires ON public.rate_limit_windows USING btree (expires_at);


--
-- Name: idx_session_bills_restaurant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_bills_restaurant_id ON public.session_bills USING btree (restaurant_id);


--
-- Name: idx_session_bills_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_session_bills_session_id ON public.session_bills USING btree (session_id);


--
-- Name: idx_subscription_transactions_razorpay_payment_id_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_subscription_transactions_razorpay_payment_id_unique ON public.subscription_transactions USING btree (razorpay_payment_id) WHERE (razorpay_payment_id IS NOT NULL);


--
-- Name: idx_table_sessions_active_table_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_table_sessions_active_table_unique ON public.table_sessions USING btree (restaurant_id, table_number) WHERE ((session_type = 'dine_in'::text) AND (status = 'active'::text));


--
-- Name: idx_table_sessions_dine_in_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_table_sessions_dine_in_phone ON public.table_sessions USING btree (restaurant_id, customer_phone, status) WHERE (session_type = 'dine_in'::text);


--
-- Name: idx_table_sessions_restaurant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_table_sessions_restaurant_id ON public.table_sessions USING btree (restaurant_id);


--
-- Name: idx_table_sessions_restaurant_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_table_sessions_restaurant_status ON public.table_sessions USING btree (restaurant_id, status);


--
-- Name: idx_table_sessions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_table_sessions_status ON public.table_sessions USING btree (status);


--
-- Name: idx_table_sessions_takeaway_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_table_sessions_takeaway_phone ON public.table_sessions USING btree (restaurant_id, customer_phone, status) WHERE (session_type = 'takeaway'::text);


--
-- Name: admin_password_reset_tokens admin_password_reset_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_password_reset_tokens
    ADD CONSTRAINT admin_password_reset_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admin_sensitive_auth admin_sensitive_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_sensitive_auth
    ADD CONSTRAINT admin_sensitive_auth_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bill_links bill_links_image_blob_id_image_blobs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bill_links
    ADD CONSTRAINT bill_links_image_blob_id_image_blobs_id_fk FOREIGN KEY (image_blob_id) REFERENCES public.image_blobs(id) ON DELETE CASCADE;


--
-- Name: bill_links bill_links_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bill_links
    ADD CONSTRAINT bill_links_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: menu_categories menu_categories_restaurant_id_restaurants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_restaurant_id_restaurants_id_fk FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_category_id_menu_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_category_id_menu_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_restaurant_id_restaurants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_restaurant_id_restaurants_id_fk FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_restaurant_id_restaurants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_restaurant_id_restaurants_id_fk FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_menu_item_id_menu_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_menu_items_id_fk FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_restaurant_id_restaurants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_restaurant_id_restaurants_id_fk FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id);


--
-- Name: orders orders_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.table_sessions(id) ON DELETE SET NULL;


--
-- Name: owner_password_reset_tokens owner_password_reset_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.owner_password_reset_tokens
    ADD CONSTRAINT owner_password_reset_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: resources resources_approved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: resources resources_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: resources resources_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: restaurant_tables restaurant_tables_restaurant_id_restaurants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_restaurant_id_restaurants_id_fk FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: restaurants restaurants_plan_id_subscription_plans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_plan_id_subscription_plans_id_fk FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: session_bills session_bills_restaurant_id_restaurants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_bills
    ADD CONSTRAINT session_bills_restaurant_id_restaurants_id_fk FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: session_bills session_bills_session_id_table_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_bills
    ADD CONSTRAINT session_bills_session_id_table_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.table_sessions(id) ON DELETE CASCADE;


--
-- Name: session_bills session_bills_verified_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session_bills
    ADD CONSTRAINT session_bills_verified_by_users_id_fk FOREIGN KEY (verified_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: subscription_transactions subscription_transactions_plan_id_subscription_plans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_transactions
    ADD CONSTRAINT subscription_transactions_plan_id_subscription_plans_id_fk FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: subscription_transactions subscription_transactions_restaurant_id_restaurants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_transactions
    ADD CONSTRAINT subscription_transactions_restaurant_id_restaurants_id_fk FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: table_sessions table_sessions_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT table_sessions_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict rzfdjzVp7nBR10CZanW1tt9jGi1uBMQeiis8t1JfnDmOVNCivPaJ68Jd35CBAmL

