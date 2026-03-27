#!/usr/bin/env perl
use strict;
use warnings;
use IO::Socket::INET;
use Cwd qw(realpath);

my $port = shift(@ARGV) // 8080;
my $root = realpath('.') or die "Cannot resolve current directory\n";

my %mime = (
    html => 'text/html; charset=utf-8',
    css  => 'text/css; charset=utf-8',
    js   => 'application/javascript; charset=utf-8',
    json => 'application/json; charset=utf-8',
    png  => 'image/png',
    jpg  => 'image/jpeg',
    jpeg => 'image/jpeg',
    gif  => 'image/gif',
    webp => 'image/webp',
    svg  => 'image/svg+xml',
    ico  => 'image/x-icon',
    txt  => 'text/plain; charset=utf-8',
    map  => 'application/json; charset=utf-8',
    woff => 'font/woff',
    woff2 => 'font/woff2',
    ttf  => 'font/ttf',
    otf  => 'font/otf',
);

my $server = IO::Socket::INET->new(
    LocalAddr => '0.0.0.0',
    LocalPort => $port,
    Proto     => 'tcp',
    Listen    => 10,
    ReuseAddr => 1,
) or die "Could not start server on port $port: $!\n";

print "Serving $root on http://0.0.0.0:$port\n";

while (my $client = $server->accept()) {
    $client->autoflush(1);

    my $request_line = <$client>;
    unless (defined $request_line) {
        close $client;
        next;
    }

    my ($method, $path) = $request_line =~ m{^(\w+)\s+([^\s]+)};

    while (my $line = <$client>) {
        last if $line =~ /^\s*$/;
    }

    if (!$method || $method ne 'GET') {
        print_response($client, 405, 'text/plain; charset=utf-8', "Method Not Allowed\n");
        close $client;
        next;
    }

    $path =~ s/\?.*$//;
    $path =~ s/#.*$//;
    $path = '/index.html' if $path eq '/';

    my $decoded = uri_decode($path);
    my $full = realpath(".$decoded");

    if (!defined $full || index($full, $root) != 0 || !-f $full) {
        print_response($client, 404, 'text/plain; charset=utf-8', "Not Found\n");
        close $client;
        next;
    }

    my ($ext) = $full =~ /\.([A-Za-z0-9]+)$/;
    $ext = defined $ext ? lc($ext) : '';
    my $content_type = $mime{$ext} // 'application/octet-stream';

    my $fh;
    if (!open $fh, '<:raw', $full) {
        print_response($client, 500, 'text/plain; charset=utf-8', "Internal Server Error\n");
        close $client;
        next;
    }

    local $/;
    my $body = <$fh>;
    close $fh;

    print $client "HTTP/1.1 200 OK\r\n";
    print $client "Content-Type: $content_type\r\n";
    print $client "Content-Length: " . length($body) . "\r\n";
    print $client "Connection: close\r\n\r\n";
    print $client $body;

    close $client;
}

sub print_response {
    my ($client, $status, $content_type, $body) = @_;
    my %status_text = (
        404 => 'Not Found',
        405 => 'Method Not Allowed',
        500 => 'Internal Server Error',
    );
    my $text = $status_text{$status} // 'OK';
    print $client "HTTP/1.1 $status $text\r\n";
    print $client "Content-Type: $content_type\r\n";
    print $client "Content-Length: " . length($body) . "\r\n";
    print $client "Connection: close\r\n\r\n";
    print $client $body;
}

sub uri_decode {
    my ($s) = @_;
    $s =~ s/\+/ /g;
    $s =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/eg;
    return $s;
}
