terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.3.0"
}

provider "oci" {
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
  region           = var.region
}

# Virtual Cloud Network
resource "oci_core_vcn" "vphone_vcn" {
  compartment_id = var.compartment_id
  cidr_block     = "10.0.0.0/16"
  display_name   = "vphone-vcn"
  dns_label      = "vphonevcn"
}

# Internet Gateway
resource "oci_core_internet_gateway" "vphone_igw" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.vphone_vcn.id
  display_name   = "vphone-igw"
  enabled        = true
}

# Route Table
resource "oci_core_route_table" "vphone_rt" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.vphone_vcn.id
  display_name   = "vphone-route-table"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.vphone_igw.id
  }
}

# Security List — allows WebRTC, SSH, HTTPS
resource "oci_core_security_list" "vphone_sl" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.vphone_vcn.id
  display_name   = "vphone-security-list"

  # Allow all outbound
  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  # SSH
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 22
      max = 22
    }
  }

  # HTTPS (signalling server)
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
  }

  # HTTP (redirect / healthcheck)
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
  }

  # WebRTC signalling (ws)
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 3000
      max = 3000
    }
  }

  # STUN/TURN UDP (WebRTC media)
  ingress_security_rules {
    protocol = "17"
    source   = "0.0.0.0/0"
    udp_options {
      min = 3478
      max = 3478
    }
  }

  # TURN TCP fallback
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 3478
      max = 3478
    }
  }

  # WebRTC media port range (UDP)
  ingress_security_rules {
    protocol = "17"
    source   = "0.0.0.0/0"
    udp_options {
      min = 49152
      max = 65535
    }
  }
}

# Subnet
resource "oci_core_subnet" "vphone_subnet" {
  compartment_id    = var.compartment_id
  vcn_id            = oci_core_vcn.vphone_vcn.id
  cidr_block        = "10.0.1.0/24"
  display_name      = "vphone-subnet"
  dns_label         = "vphonesubnet"
  route_table_id    = oci_core_route_table.vphone_rt.id
  security_list_ids = [oci_core_security_list.vphone_sl.id]
}

# Reserved Public IP
resource "oci_core_public_ip" "vphone_public_ip" {
  compartment_id = var.compartment_id
  lifetime       = "RESERVED"
  display_name   = "vphone-public-ip"
}

# Main compute instance — Oracle Always Free Ampere ARM (4 OCPUs, 24GB RAM)
resource "oci_core_instance" "vphone_server" {
  compartment_id      = var.compartment_id
  availability_domain = var.availability_domain
  display_name        = "vphone-server"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = 4
    memory_in_gbs = 24
  }

  source_details {
    source_type = "image"
    source_id   = var.ubuntu_image_ocid  # Ubuntu 22.04 ARM — see variables.tf
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.vphone_subnet.id
    display_name     = "vphone-vnic"
    assign_public_ip = false  # We use reserved IP below
    hostname_label   = "vphone"
  }

  metadata = {
    ssh_authorized_keys = file(var.ssh_public_key_path)
    user_data           = base64encode(file("${path.module}/../server/setup.sh"))
  }

  freeform_tags = {
    project = "vphone"
    env     = "production"
  }
}

# Attach reserved IP to instance
resource "oci_core_private_ip" "vphone_private_ip" {
  vnic_id = oci_core_instance.vphone_server.create_vnic_details[0].subnet_id
}
